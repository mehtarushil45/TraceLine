import React, { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { LoadingState } from './components/common';

// Route Code-Splitting with dynamic imports for minimal initial bundle size
const DashboardPage = React.lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const CommunitiesPage = React.lazy(() => import('./pages/CommunitiesPage').then((m) => ({ default: m.CommunitiesPage })));
const CommunityDetailPage = React.lazy(() => import('./pages/CommunityDetailPage').then((m) => ({ default: m.CommunityDetailPage })));
const CommunityInvestigationPage = React.lazy(() => import('./pages/CommunityInvestigationPage').then((m) => ({ default: m.CommunityInvestigationPage })));
const AccountsListPage = React.lazy(() => import('./pages/AccountsListPage').then((m) => ({ default: m.AccountsListPage })));
const AccountDetailPage = React.lazy(() => import('./pages/AccountDetailPage').then((m) => ({ default: m.AccountDetailPage })));
const TransactionsListPage = React.lazy(() => import('./pages/TransactionsListPage').then((m) => ({ default: m.TransactionsListPage })));
const TransactionDetailPage = React.lazy(() => import('./pages/TransactionDetailPage').then((m) => ({ default: m.TransactionDetailPage })));
const InvestigationsPage = React.lazy(() => import('./pages/InvestigationsPage').then((m) => ({ default: m.InvestigationsPage })));
const CaseDetailPage = React.lazy(() => import('./pages/CaseDetailPage').then((m) => ({ default: m.CaseDetailPage })));
const ForensicWorkspacePage = React.lazy(() => import('./pages/ForensicWorkspacePage').then((m) => ({ default: m.ForensicWorkspacePage })));

// Prefetch map for hover-based anticipation
export const prefetchRoute = {
  dashboard: () => import('./pages/DashboardPage'),
  communities: () => import('./pages/CommunitiesPage'),
  forensics: () => import('./pages/ForensicWorkspacePage'),
  accounts: () => import('./pages/AccountsListPage'),
  transactions: () => import('./pages/TransactionsListPage'),
  investigations: () => import('./pages/InvestigationsPage'),
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div style={{ padding: '40px', maxWidth: '1600px', margin: '0 auto' }}>
            <LoadingState type="card" count={1} />
            <div style={{ marginTop: '20px' }}>
              <LoadingState type="table" count={5} />
            </div>
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Layout />}>
            {/* Primary Product Entrypoint: Risk Queue */}
            <Route index element={<DashboardPage />} />
            <Route path="dashboard" element={<Navigate to="/" replace />} />

            {/* Page 2: Community Investigation — browse, select, and overview */}
            <Route path="communities" element={<CommunitiesPage />} />
            <Route path="communities/:communityId" element={<CommunityDetailPage />} />

            {/* Page 3: Forensic Investigation Workspace — deep investigation per community */}
            <Route path="communities/:communityId/investigate" element={<CommunityInvestigationPage />} />

            {/* Accounts Registry & Deep Investigation */}
            <Route path="accounts" element={<AccountsListPage />} />
            <Route path="accounts/:accountId" element={<AccountDetailPage />} />

            {/* Transactions Registry & Deep Investigation */}
            <Route path="transactions" element={<TransactionsListPage />} />
            <Route path="transactions/:transactionId" element={<TransactionDetailPage />} />

            {/* Forensic Case Management & Dossiers */}
            <Route path="investigations" element={<InvestigationsPage />} />
            <Route path="investigations/:caseId" element={<CaseDetailPage />} />

            {/* PAGE 3: Top-level Forensic Workspace */}
            {/* Route: /forensics?community=<id>&view=<view> */}
            <Route path="forensics" element={<ForensicWorkspacePage />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
