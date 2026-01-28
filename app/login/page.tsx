"use client";

import { useActionState } from "react";
import { login } from "../actions";

const initialState = {
    error: "",
};

export default function LoginPage() {
    const [state, formAction, isPending] = useActionState(login, initialState);

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <div className="w-full max-w-sm space-y-4">
                <h1 className="text-xl font-medium text-center mb-8 tracking-tight">Reel Scripter</h1>
                <form action={formAction} className="space-y-4">
                    <div>
                        <input
                            type="password"
                            name="password"
                            placeholder="Password..."
                            autoFocus
                            className="w-full bg-transparent border-b border-neutral-200 dark:border-neutral-800 py-2 px-0 text-center text-lg placeholder:text-neutral-400 focus:border-neutral-900 dark:focus:border-neutral-100 focus:outline-none transition-colors"
                        />
                    </div>
                    {state?.error && (
                        <p className="text-sm text-red-500 text-center">{state.error}</p>
                    )}
                    <button
                        type="submit"
                        disabled={isPending}
                        className="w-full rounded-full bg-neutral-900 dark:bg-neutral-100 text-neutral-50 dark:text-neutral-950 py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {isPending ? "Entering..." : "Enter"}
                    </button>
                </form>
            </div>
        </div>
    );
}
