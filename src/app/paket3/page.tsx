import { redirect } from "next/navigation";
import { STORY_PATH } from "@/lib/users/catalog";

/** Legacy Paket-3 composer URL → shared `/geschichte`. */
export default function Paket3Page() {
  redirect(STORY_PATH);
}
