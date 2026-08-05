import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './features/auth/RequireAuth';
import { RequireRole } from './features/auth/RequireRole';
import { LoginPage } from './features/auth/routes/LoginPage';
import { AppShell } from './components/AppShell';
import { HomePage } from './routes/HomePage';
import { AdminPage } from './routes/AdminPage';
import { MasterdataPage } from './routes/MasterdataPage';
import { LocationListPage } from './features/locations/routes/LocationListPage';
import { LocationEditPage } from './features/locations/routes/LocationEditPage';
import { AssetTypeListPage } from './features/asset-types/routes/AssetTypeListPage';
import { AssetTypeEditPage } from './features/asset-types/routes/AssetTypeEditPage';
import { IncidentTypeListPage } from './features/incident-types/routes/IncidentTypeListPage';
import { AssetListPage } from './features/assets/routes/AssetListPage';
import { AssetEditPage } from './features/assets/routes/AssetEditPage';
import { InspectionListPage } from './features/inspections/routes/InspectionListPage';
import { InspectionEditPage } from './features/inspections/routes/InspectionEditPage';
import { InspectPickPage } from './features/capture/routes/InspectPickPage';
import { InspectCapturePage } from './features/capture/routes/InspectCapturePage';
import { ActivityListPage } from './features/capture/routes/ActivityListPage';
import { ActivityDetailPage } from './features/capture/routes/ActivityDetailPage';
import { IncidentListPage } from './features/incidents/routes/IncidentListPage';
import { IncidentEditPage } from './features/incidents/routes/IncidentEditPage';

/**
 * One responsive route tree — not separate web and PWA trees (ADR-007).
 *
 * The guards below are UX. RLS is the security.
 */
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />

          {/* The capture path: pick an asset, record readings, see the result. */}
          <Route path="inspect" element={<InspectPickPage />} />
          <Route path="inspect/:assetId" element={<InspectCapturePage />} />
          <Route path="activities" element={<ActivityListPage />} />
          <Route path="activities/:id" element={<ActivityDetailPage />} />

          <Route path="incidents" element={<IncidentListPage />} />
          <Route path="incidents/:id" element={<IncidentEditPage />} />

          <Route path="assets" element={<AssetListPage />} />
          <Route path="assets/:id" element={<AssetEditPage />} />

          {/* Defining what gets inspected is configuration, not field work. */}
          <Route element={<RequireRole roles={['admin', 'system_admin']} />}>
            <Route path="inspections" element={<InspectionListPage />} />
            <Route path="inspections/:id" element={<InspectionEditPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>

          <Route path="masterdata" element={<MasterdataPage />}>
            <Route index element={<Navigate to="locations" replace />} />
            <Route path="locations" element={<LocationListPage />} />
            <Route path="asset-types" element={<AssetTypeListPage />} />
            <Route path="incident-types" element={<IncidentTypeListPage />} />
          </Route>

          {/* Edit pages sit outside the tabbed shell so the form gets full width. */}
          <Route path="masterdata/locations/:id" element={<LocationEditPage />} />
          <Route path="masterdata/asset-types/:id" element={<AssetTypeEditPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
