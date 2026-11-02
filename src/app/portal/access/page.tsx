import { PortalMagicLinkConfirm } from "@/components/PortalMagicLinkConfirm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Accès à la documentation",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PortalAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh items-center p-4"
    >
      {token ? (
        <PortalMagicLinkConfirm token={token} />
      ) : (
        <p role="alert">
          Le lien d’accès est incomplet. Demandez-en un nouveau.
        </p>
      )}
    </main>
  );
}
