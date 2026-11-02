import { AccountPasswordForm } from "@/components/AccountPasswordForm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Définir un mot de passe",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function ActivateAccountPage({
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
        <AccountPasswordForm token={token} />
      ) : (
        <p className="mx-auto max-w-sm" role="alert">
          Le lien est incomplet. Utilisez le lien reçu par e-mail ou demandez-en
          un nouveau.
        </p>
      )}
    </main>
  );
}
