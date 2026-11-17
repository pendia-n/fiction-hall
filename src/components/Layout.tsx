import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import { TermsUpdateNotice } from '../pages/Terms';

export default function Layout() {
  const isLanding = useLocation().pathname === '/';

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Navbar />
      <TermsUpdateNotice />
      <main id="main-content" tabIndex={-1} className={isLanding ? 'main-content landing-main' : 'main-content'}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
