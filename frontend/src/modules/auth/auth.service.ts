import { httpClient } from "../../services/http";
import { LoginResponse } from "./auth.types";

type LoginInput = {
  email: string;
  password: string;
};

type RegisterInput = {
  name: string;
  email: string;
  password: string;
  role: "TENANT_ADMIN" | "STAFF";
};

export const authService = {
  async login(payload: LoginInput): Promise<LoginResponse> {
    const { data } = await httpClient.post<LoginResponse>("/auth/login", payload);
    return data;
  },
  async register(payload: RegisterInput): Promise<LoginResponse> {
    const { data } = await httpClient.post<LoginResponse>("/auth/register", payload);
    return data;
  },
  async refresh(): Promise<{ accessToken: string; refreshToken?: string }> {
    const { data } = await httpClient.post<{ accessToken: string; refreshToken?: string }>("/auth/refresh", {});
    return data;
  },
  async me(): Promise<{
    user: {
      id: string;
      userId?: string;
      email: string;
      name?: string;
      role: string;
      tenantId: string;
      customPermissions?: string[];
      effectivePermissions?: string[];
    };
  }> {
    const { data } = await httpClient.get<{
      success: boolean;
      user: {
        id: string;
        userId?: string;
        email: string;
        name?: string;
        role: string;
        tenantId: string;
        customPermissions?: string[];
        effectivePermissions?: string[];
      };
    }>("/auth/me");
    return { user: data.user };
  },
  async logout(): Promise<void> {
    await httpClient.post("/auth/logout");
  }
};
