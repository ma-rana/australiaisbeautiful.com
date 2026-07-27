// app/help/page.tsx — the public help & feedback page.
//
// Reachable by anyone, signed in or not (a broken sign-up must be reportable
// by the person it's blocking). The server half just reads the session so the
// form can prefill the email of a signed-in sender; everything else is the
// client form.

import { getSessionUser } from "@/lib/auth";
import { HelpForm } from "./HelpForm";

export const metadata = {
  title: "Help & feedback — Australia Is Beautiful",
};

export default async function HelpPage() {
  const user = await getSessionUser();
  return <HelpForm defaultEmail={user?.email ?? ""} />;
}
