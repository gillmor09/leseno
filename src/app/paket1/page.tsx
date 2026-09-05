import { redirect } from "next/navigation";
import { STORY_PATH } from "@/lib/users/catalog";

/** Legacy Paket-1 composer URL → shared `/geschichte`. */
export default function Paket1Page() {
  redirect(STORY_PATH);
}
