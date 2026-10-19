import { Empty, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="space-y-4">
      <Empty>That page doesn’t exist, or the item was deleted.</Empty>
      <LinkButton href="/" variant="secondary">Back to dashboard</LinkButton>
    </div>
  );
}
