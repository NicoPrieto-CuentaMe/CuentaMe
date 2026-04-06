import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      restaurantName: string;
    } & DefaultSession["user"];
  }

  interface User {
    restaurantName: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    restaurantName: string;
  }
}
