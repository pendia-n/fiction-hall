import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import { TermsUpdateNotice } from '../pages/Terms';

export default function Layout() {
  return (
    <div className="app-layout">
      <Navbar />
      <TermsUpdateNotice />
      <main className="main-content">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
