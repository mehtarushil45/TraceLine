import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { CommunitiesPage } from './pages/CommunitiesPage';
import { CommunityDetailPage } from './pages/CommunityDetailPage';
import { AccountsListPage } from './pages/AccountsListPage';
import { AccountDetailPage } from './pages/AccountDetailPage';
import { TransactionsListPage } from './pages/TransactionsListPage';
import { TransactionDetailPage } from './pages/TransactionDetailPage';
import { InvestigationsPage } from './pages/InvestigationsPage';
import { CaseDetailPage } from './pages/CaseDetailPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Primary Product Entrypoint: Risk Queue */}
          <Route index element={<DashboardPage />} />
          <Route path="dashboard" element={<Navigate to="/" replace />} />

          {/* Page 2: Community Intelligence — browse and select investigation targets */}
          <Route path="communities" element={<CommunitiesPage />} />
          <Route path="communities/:communityId" element={<CommunityDetailPage />} />

          {/* Accounts Registry & Deep Investigation */}
          <Route path="accounts" element={<AccountsListPage />} />
          <Route path="accounts/:accountId" element={<AccountDetailPage />} />

          {/* Transactions Registry & Deep Investigation */}
          <Route path="transactions" element={<TransactionsListPage />} />
          <Route path="transactions/:transactionId" element={<TransactionDetailPage />} />

          {/* Forensic Case Management & Dossiers */}
          <Route path="investigations" element={<InvestigationsPage />} />
          <Route path="investigations/:caseId" element={<CaseDetailPage />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
