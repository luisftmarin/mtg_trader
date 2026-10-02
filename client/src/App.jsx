import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, DataProvider, useAuth } from "./context.jsx";
import { ToastProvider } from "./components/ToastHost.jsx";
import { LoginScreen } from "./screens/LoginScreen.jsx";
import { AppShell } from "./screens/AppShell.jsx";
import { DashboardScreen } from "./screens/DashboardScreen.jsx";
import { TradesScreen } from "./screens/TradesScreen.jsx";
import { BinderScreen } from "./screens/BinderScreen.jsx";
import { FriendScreen, RosterScreen, NotificationsScreen, ComingSoon } from "./screens/FriendScreen.jsx";
import { ProfileScreen } from "./screens/ProfileScreen.jsx";

function Gate() {
  const { identity } = useAuth();
  if (!identity) return <LoginScreen />;
  return (
    <DataProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardScreen />} />
          <Route path="/trades" element={<TradesScreen />} />
          <Route
            path="/trades/new"
            element={<ComingSoon title="New trade" copy="Sending a proposal is the next PR. Matches are already on the Trades screen." />}
          />
          <Route
            path="/trades/:id"
            element={<ComingSoon title="Trade" copy="Trade detail, comments and accept/decline arrive with the trades PR." />}
          />
          <Route path="/binder" element={<BinderScreen />} />
          <Route path="/friends" element={<RosterScreen />} />
          <Route path="/friends/:id" element={<FriendScreen />} />
          <Route path="/notifications" element={<NotificationsScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Gate />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
