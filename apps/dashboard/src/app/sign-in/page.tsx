import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-meluri-400 mb-2">Meluri MPC</h1>
        <p className="text-gray-400 mb-8">Sign in to your developer dashboard</p>
        <SignIn />
      </div>
    </div>
  );
}
