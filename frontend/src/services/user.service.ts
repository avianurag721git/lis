import { httpClient } from "./http";
import type { UserRole } from "../modules/auth/auth.types";

export type UserProfile = {
  userId: string;
  email: string;
  role: UserRole | string;
  name?: string;
};

export const getUserProfile = async (): Promise<UserProfile> => {
  const { data } = await httpClient.get<{ profile: UserProfile } | { success: true; data: { profile: UserProfile } }>(
    "/users/profile"
  );
  const anyData = data as { profile?: UserProfile; data?: { profile?: UserProfile } };
  return anyData.profile ?? anyData.data?.profile ?? (data as unknown as UserProfile);
};
