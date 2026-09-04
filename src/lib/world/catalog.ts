/**
 * "Meine Welt" profile shape: display name plus three editable string lists.
 * `experiences` stores wish-list items ("Das möchte ich mal erleben"), not past events.
 */

export type UserWorldProfile = {
  displayName: string;
  friends: string[];
  interests: string[];
  experiences: string[];
};

export const EMPTY_USER_WORLD: UserWorldProfile = {
  displayName: "",
  friends: [],
  interests: [],
  experiences: [],
};
