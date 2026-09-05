import { redirect } from "next/navigation";
import { STORY_PATH } from "@/lib/users/catalog";

/** Legacy Paket-2 composer URL → shared `/geschichte`. */
export default function Paket2Page() {
  redirect(STORY_PATH);
}
