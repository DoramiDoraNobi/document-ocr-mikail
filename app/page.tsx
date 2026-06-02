import { getAuthUserFromHeaders } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import HomeClient from "./HomeClient";


export default async function Page() {
  const reqHeaders = await headers();
  const user = await getAuthUserFromHeaders(reqHeaders);
  
  if (!user) {
    redirect("/login");
  }
  
  return <HomeClient />;
}
