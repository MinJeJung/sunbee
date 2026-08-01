import "server-only";

import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

export async function requireOwner() {
  if (!(await isAuthenticated())) redirect("/login");
}
