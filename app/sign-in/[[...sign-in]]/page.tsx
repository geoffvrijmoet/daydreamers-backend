"use client";

import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">      
      <SignIn 
        appearance={{
          elements: {
            rootBox: "w-full max-w-md",
            card: "bg-white shadow-lg rounded-lg p-6",
            headerTitle: "font-medium text-center",
            headerSubtitle: "font-light text-center",
            formButtonPrimary: "bg-blue-600 hover:bg-blue-700",
          }
        }}
      />
    </div>
  );
} 