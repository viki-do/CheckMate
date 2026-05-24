import React from 'react';
import { Link } from 'react-router-dom';

const DemoExpiredPage = () => (
  <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#262421] px-6 text-center font-sans text-white">
    <img src="/assets/pieces/white_pawn.png" className="mb-6 w-16 opacity-90" alt="logo" />
    <h1 className="mb-3 text-3xl font-bold">Demo mode has expired</h1>
    <p className="mb-8 max-w-md text-[#b8b8b8]">
      This demo access is no longer available. Saved demo data is locked on the backend.
    </p>
    <Link
      to="/login"
      className="rounded bg-[#81b64c] px-5 py-3 font-bold text-white no-underline transition-colors hover:bg-[#a3d16a]"
    >
      Back to login
    </Link>
  </div>
);

export default DemoExpiredPage;
