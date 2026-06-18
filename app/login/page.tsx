import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — AI Interview Coach" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const { registered } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">AI Interview Coach</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to start practising.</p>
        </div>

        <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
          <LoginForm registered={registered === "1"} />
        </div>
      </div>
    </div>
  );
}
