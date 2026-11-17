import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import { TermsUpdateNotice } from '../pages/Terms';

export default function Layout() {
  const isLanding = useLocation().pathname === '/';

  return (
    <div className={isLanding ? 'app-layout landing-layout' : 'app-layout'}>
      <Navbar isLanding={isLanding} />
      <TermsUpdateNotice />
      <main className="main-content">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
