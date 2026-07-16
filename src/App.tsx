import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Fiction from './pages/Fiction';
import CollectionNotes from './pages/CollectionNotes';
import NoteRead from './pages/NoteRead';
import NoteWrite from './pages/NoteWrite';
import AuthorNotes from './pages/AuthorNotes';
import Auth from './pages/Auth';
import Profile from './pages/Profile';
import SecuritySettings from './pages/SecuritySettings';
import About from './pages/About';
import Why from './pages/Why';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import NotFound from './pages/NotFound';
import UnlockPage from './pages/UnlockPage';
import LiveNow from './pages/LiveNow';
import StartStream from './pages/StartStream';
import WatchStream from './pages/WatchStream';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/fiction" element={<Fiction />} />
        <Route path="/fiction/collections/:collectionId/notes" element={<CollectionNotes />} />
        <Route path="/fiction/collections/:collectionId/unlock" element={<UnlockPage />} />
        <Route path="/fiction/collections/:collectionId/notes/:noteId" element={<NoteRead />} />
        <Route path="/fiction/collections/:collectionId/notes/:noteId/write" element={<NoteWrite />} />
        <Route path="/fiction/authors/:username/notes" element={<AuthorNotes />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/security" element={<SecuritySettings />} />
        <Route path="/about" element={<About />} />
        <Route path="/why" element={<Why />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/live" element={<LiveNow />} />
        <Route path="/live/start" element={<StartStream />} />
        <Route path="/live/:id" element={<WatchStream />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
