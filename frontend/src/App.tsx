import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import SignIn from './pages/SignIn';
import Dashboard from './pages/Dashboard';
import AssistantConnection from './pages/AssistantConnection';
import InstallAssistant from './pages/InstallAssistant';
import ChannelSelect from './pages/ChannelSelect';
import ConnectChannel from './pages/ConnectChannel';
import OnboardingSuccess from './pages/OnboardingSuccess';
import Approvals from './pages/Approvals';
import Settings from './pages/Settings';
import Paywall from './pages/Paywall';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />

        {/* Protected: onboarding */}
        <Route element={<ProtectedRoute />}>
          <Route path="/assistants" element={<AssistantConnection />} />
          <Route path="/install" element={<InstallAssistant />} />
          <Route path="/channel" element={<ChannelSelect />} />
          <Route path="/connect/:platform" element={<ConnectChannel />} />
          <Route path="/success" element={<OnboardingSuccess />} />
          <Route path="/paywall" element={<Paywall />} />
        </Route>

        {/* Protected: dashboard (standalone, no sidebar) */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
        </Route>

        {/* Protected: other pages with sidebar */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
