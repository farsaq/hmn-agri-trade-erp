import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/Auth';

const PublicSite = lazy(() => import('./pages/PublicSite'));
const Login = lazy(() => import('./pages/Login'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const SecurityPage = lazy(() => import('./admin/SecurityPage'));
const WarehouseUnitsPage = lazy(() => import('./admin/WarehouseUnitsPage'));
const AccountingPage = lazy(() => import('./admin/AccountingPage'));
const AIAssistant = lazy(() => import('./admin/AIAssistant'));
const IntegrationsPage = lazy(() => import('./admin/IntegrationsPage'));
const Customers = lazy(() => import('./admin/CustomerManagement').then((m) => ({ default: m.Customers })));
const CustomerDetail = lazy(() => import('./admin/CustomerManagement').then((m) => ({ default: m.CustomerDetail })));
const Dashboard = lazy(() => import('./admin/AdminApp').then((m) => ({ default: m.Dashboard })));
const SettingsPage = lazy(() => import('./admin/AdminApp').then((m) => ({ default: m.SettingsPage })));
const TransactionPage = lazy(() => import('./admin/AdminApp').then((m) => ({ default: m.TransactionPage })));
const Khata = lazy(() => import('./admin/AdminApp').then((m) => ({ default: m.Khata })));
const SuppliersPro = lazy(() => import('./admin/OperationsPages').then((m) => ({ default: m.SuppliersPro })));
const ProductsPro = lazy(() => import('./admin/OperationsPages').then((m) => ({ default: m.ProductsPro })));
const InventoryPro = lazy(() => import('./admin/OperationsPages').then((m) => ({ default: m.InventoryPro })));
const SalesPro = lazy(() => import('./admin/OperationsPages').then((m) => ({ default: m.SalesPro })));
const ExpensesPro = lazy(() => import('./admin/FinancePages').then((m) => ({ default: m.ExpensesPro })));
const AdvancedReports = lazy(() => import('./admin/FinancePages').then((m) => ({ default: m.AdvancedReports })));
const InvoiceCenter = lazy(() => import('./admin/FinancePages').then((m) => ({ default: m.InvoiceCenter })));
const NotificationsPage = lazy(() => import('./admin/GovernancePages').then((m) => ({ default: m.NotificationsPage })));
const AuditLogsPage = lazy(() => import('./admin/GovernancePages').then((m) => ({ default: m.AuditLogsPage })));
const RolesPage = lazy(() => import('./admin/GovernancePages').then((m) => ({ default: m.RolesPage })));

const loading = (
  <div className="grid min-h-screen place-items-center bg-green-950 font-black text-white">Loading HMN ERP...</div>
);
function Guard({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return loading;
  return user ? children : <Navigate to="/admin/login" replace />;
}
const secured = (element) => <Guard>{element}</Guard>;
export default function App() {
  return (
    <Suspense fallback={loading}>
      <Routes>
        <Route path="/" element={<PublicSite />} />
        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin/reset-password" element={<ResetPassword />} />
        <Route path="/admin/verify-email" element={<VerifyEmail />} />
        <Route path="/admin" element={secured(<Dashboard />)} />
        <Route path="/admin/ai" element={secured(<AIAssistant />)} />
        <Route path="/admin/customers" element={secured(<Customers />)} />
        <Route path="/admin/customers/:id" element={secured(<CustomerDetail />)} />
        <Route path="/admin/suppliers" element={secured(<SuppliersPro />)} />
        <Route path="/admin/products" element={secured(<ProductsPro />)} />
        <Route path="/admin/inventory" element={secured(<InventoryPro />)} />
        <Route path="/admin/warehouses-units" element={secured(<WarehouseUnitsPage />)} />
        <Route path="/admin/purchases" element={secured(<TransactionPage type="purchases" title="Purchases" />)} />
        <Route path="/admin/sales" element={secured(<SalesPro />)} />
        <Route path="/admin/khata" element={secured(<Khata />)} />
        <Route path="/admin/accounting" element={secured(<AccountingPage />)} />
        <Route path="/admin/expenses" element={secured(<ExpensesPro />)} />
        <Route path="/admin/reports" element={secured(<AdvancedReports />)} />
        <Route path="/admin/invoices" element={secured(<InvoiceCenter />)} />
        <Route path="/admin/notifications" element={secured(<NotificationsPage />)} />
        <Route path="/admin/audit-logs" element={secured(<AuditLogsPage />)} />
        <Route path="/admin/roles" element={secured(<RolesPage />)} />
        <Route path="/admin/integrations" element={secured(<IntegrationsPage />)} />
        <Route path="/admin/settings" element={secured(<SettingsPage />)} />
        <Route path="/admin/security" element={secured(<SecurityPage />)} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
}
