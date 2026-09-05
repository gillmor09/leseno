import { redirect } from "next/navigation";
import { STORY_PATH } from "@/lib/users/catalog";

/** Legacy Basis composer URL → shared `/geschichte`. */
export default function BasisPage() {
  redirect(STORY_PATH);
}
