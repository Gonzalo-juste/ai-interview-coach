import { NewSessionForm } from "./new-session-form";

export const metadata = {
  title: "New Session — AI Interview Coach",
};

export default function NewSessionPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            New Interview Session
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Paste your job description and CV. The AI will research the company, build
            a tailored interviewer, and start a mock interview calibrated to the role.
          </p>
        </div>

        <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
          <NewSessionForm />
        </div>
      </div>
    </div>
  );
}
