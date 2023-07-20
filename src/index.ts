import {
  $query,
  $update,
  Record,
  StableBTreeMap,
  Vec,
  match,
  Result,
  nat64,
  ic,
  Opt,
  Principal,
  nat32,
} from "azle";
import { v4 as uuidv4 } from "uuid";

// Define the Room type
type Room = Record<{
  id: string; // Unique identifier for the room
  title: string; // Title of the room
  description: string; // Description of the room
  avatar: string; // URL of the room's avatar image
  owner: Principal; // Owner of the room
  members: Vec<Principal>; // Array of room members
  messages: Vec<Message>;
  createdAt: nat64; // Timestamp of when the room was created
  updatedAt: Opt<nat64>; // Optional timestamp of when the room was last updated
}>;

// Define the RoomPayload type for creating and updating rooms
type RoomPayload = Record<{
  title: string; // Title of the room
  description: string; // Description of the room
  avatar: string; // URL of the room's avatar image
}>;

// Define the Message type
type Message = Record<{
  message: string; // Content of the message
  sender: Principal; // Sender of the message
}>;

// Define the MessagePayload type for sending messages
type MessagePayload = Record<{
  message: string; // Content of the message
  roomId: string; // ID of the room to which the message belongs
}>;

// Create a new StableBTreeMap to store rooms and messages
const roomStorage = new StableBTreeMap<string, Room>(0, 44, 1024);

$query;
// Retrieve rooms for the current user
export function getRoomsForUser(): Result<Vec<Room>, string> {
  const rooms = roomStorage.values();
  const returnedRooms: Room[] = [];

  for (const room of rooms) {
    if (room.members.findIndex((member) => member.toString() === ic.caller().toString()) > -1) {
      returnedRooms.push(room);
    }
  }

  return Result.Ok(returnedRooms);
}

$query;
// Retrieve a specific room by ID
export function getRoom(id: string): Result<Room, string> {
  return match(roomStorage.get(id), {
    Some: (room: Room) => Result.Ok<Room, string>(room),
    None: () => Result.Err<Room, string>(`A room with id=${id} was not found.`),
  });
}

$update;
// Add a new room
export function addRoom(payload: RoomPayload): Result<Room, string> {
  const room: Room = {
    id: uuidv4(), // Generate a unique ID for the new room
    createdAt: ic.time(), // Set the creation timestamp to the current time
    updatedAt: Opt.None, // Set the initial update timestamp as None
    owner: ic.caller(), // Set the owner of the room as the current caller
    members: [ic.caller()], // Initialize the members array with the caller as first member
    messages: [],
    ...payload,
  };

  roomStorage.insert(room.id, room); // Store the room in the room storage
  return Result.Ok(room);
}

$update;
// Update an existing room
export function updateRoom(
  id: string,
  payload: RoomPayload
): Result<Room, string> {
  return match(roomStorage.get(id), {
    Some: (room: Room) => {
      // Confirm only owner can call this function
      if (ic.caller().toString() !== room.owner.toString()) {
        return Result.Err<Room, string>(
          `You are not authorized to update the room.`
        );
      }

      const updatedRoom: Room = {
        ...room,
        ...payload,
        updatedAt: Opt.Some(ic.time()), // Set the update timestamp to the current time
      };
      roomStorage.insert(room.id, updatedRoom); // Update the room in the room storage
      return Result.Ok<Room, string>(updatedRoom);
    },
    None: () =>
      Result.Err<Room, string>(
        `Couldn't update a room with id=${id}. Room not found.`
      ),
  });
}

$update;
// Add a member to a room
export function addMembersToRoom(
  id: string,
  member: Principal
): Result<Room, string> {
  return match(roomStorage.get(id), {
    Some: (room: Room) => {
      // Confirm only owner can call this function
      if (ic.caller().toString() !== room.owner.toString()) {
        return Result.Err<Room, string>(`You are not the owner of the room.`);
      }

      room.members.push(member); // Add the member to the room's members array
      roomStorage.insert(room.id, room); // Update the room in the room storage
      return Result.Ok<Room, string>(room);
    },
    None: () =>
      Result.Err<Room, string>(
        `Couldn't update a room with id=${id}. Room not found.`
      ),
  });
}

$update;
// Delete a room
export function deleteRoom(id: string): Result<string, string> {
  return match(roomStorage.get(id), {
    Some: (room: Room) => {
      // Confirm only owner can call this function
      if (ic.caller().toString() !== room.owner.toString()) {
        return Result.Err<string, string>(
          `You are not authorized to delete the room.`
        );
      }

      roomStorage.remove(id); // Remove the room from the room storage
      return Result.Ok<string, string>(
        `Successfully deleted the room.`
      );
    },
    None: () => {
      return Result.Err<string, string>(
        `couldn't delete a room with id=${id}. Room not found`
      );
    },
  });
}

$update;
// Send a message to a room
export function sendMessage(payload: MessagePayload): Result<Message, string> {
  return match(roomStorage.get(payload.roomId), {
    Some: (room: Room) => {
      // Confirm only members of room can call this function
      const isMember = room.members.findIndex((member) => member.toString() === ic.caller().toString()) > -1? true: false;
      if (!isMember) {
        return Result.Err<Message, string>(`You don't belong to this room.`);
      }

      const message = { sender: ic.caller(), id: uuidv4(), ...payload }; // Create the message payload
      roomStorage.insert(room.id, {...room, messages: [...room.messages, message]}) // Store the message in the message storage
      return Result.Ok<Message, string>(message);
    },
    None: () =>
      Result.Err<Message, string>(
        `A room with id=${payload.roomId} was not found.`
      ),
  });
}

$query;
// Retrieve messages for a room
export function getMessagesForRoom(
  roomId: string
): Result<Vec<Message>, string> {
  return match(roomStorage.get(roomId), {
    Some: (room: Room) => {
      // Confirm only members of room can call this function
      const isMember = room.members.findIndex((member) => member.toString() === ic.caller().toString()) > -1? true: false;
      if (!isMember) {
        return Result.Err<Message[], string>(`You don't belong to this room.`);
      }
      return Result.Ok<Message[], string>(room.messages);
    },
    None: () => {
      return Result.Err<Message[], string>(
        `A room with id=${roomId} was not found.`
      );
    },
  });
}

$update;
// Delete a message
export function deleteMessage(id: string, messageId: nat32): Result<string, string> {
  return match(roomStorage.get(id), {
    Some: (room: Room) => {
      if(room.messages.length <= messageId){
        return Result.Err<string,string>("MessageId is out of bounds.")
      }
      // Confirm only owner of message can call this function
      if (ic.caller().toString() !== room.messages[messageId].sender.toString()) {
        return Result.Err<string, string>(
          `You are not authorized to delete this message.`
        );
      }
      const updatedMessages = [...room.messages];
      updatedMessages.splice(messageId, 1) // Remove the message from the message storage
      roomStorage.insert(id, {...room, messages: updatedMessages})
      return Result.Ok<string, string>(`Message deleted successfully`);
    },
    None: () => {
      return Result.Err<string, string>(
        `couldn't delete a message with id=${id}. message not found`
      );
    },
  });
}

// a workaround to make uuid package work with Azle
globalThis.crypto = {
  getRandomValues: () => {
    let array = new Uint8Array(32);

    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }

    return array;
  },
};
