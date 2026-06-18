"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "@/lib/actions/auth";

export function LoginForm({ registered }: { registered: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const [signInState, signInAction, signInPending] = useActionState<AuthState, FormData>(
    signIn,
    null
  );
  const [signUpState, signUpAction, signUpPending] = useActionState<AuthState, FormData>(
    signUp,
    null
  );

  const isPending = signInPending || signUpPending;
  const state = mode === "signin" ? signInState : signUpState;
  const action = mode === "signin" ? signInAction : signUpAction;

  return (
    <div className="space-y-6">
      {registered && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          Account created. Check your email to confirm your address, then sign in.
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex rounded-md border border-gray-200 p-0.5 text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`flex-1 rounded py-2 transition-colors ${
            mode === "signin" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`flex-1 rounded py-2 transition-colors ${
            mode === "signup" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800"
          }`}
        >
          Create account
        </button>
      </div>

      <form action={action} className="space-y-4">
        {state?.error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {state.error}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm font-medium text-gray-900">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            disabled={isPending}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm font-medium text-gray-900">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            disabled={isPending}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50"
          />
          {mode === "signup" && (
            <p className="text-xs text-gray-400">Minimum 8 characters.</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isPending
            ? mode === "signin"
              ? "Signing in…"
              : "Creating account…"
            : mode === "signin"
            ? "Sign in"
            : "Create account"}
        </button>
      </form>
    </div>
  );
}
