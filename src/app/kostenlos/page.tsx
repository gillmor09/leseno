import { redirect } from "next/navigation";

/** Legacy URL — freemium composer now lives at `/basis`. */
export default function KostenlosRedirectPage() {
  redirect("/basis");
}
