import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { CommunitiesPage } from './pages/CommunitiesPage';
import { CommunityDetailPage } from './pages/CommunityDetailPage';
import { CommunityInvestigationPage } from './pages/CommunityInvestigationPage';
import { AccountsListPage } from './pages/AccountsListPage';
import { AccountDetailPage } from './pages/AccountDetailPage';
import { TransactionsListPage } from './pages/TransactionsListPage';
import { TransactionDetailPage } from './pages/TransactionDetailPage';
import { InvestigationsPage } from './pages/InvestigationsPage';
import { CaseDetailPage } from './pages/CaseDetailPage';
import { ForensicWorkspacePage } from './pages/ForensicWorkspacePage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
};

export default App;
