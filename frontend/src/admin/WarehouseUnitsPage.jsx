import { useEffect, useState } from 'react';
import api from '../services/api';
export default function WarehouseUnitsPage() {
  const [warehouses, setWarehouses] = useState([]),
    [units, setUnits] = useState([]),
    [tab, setTab] = useState('warehouses'),
    [error, setError] = useState('');
  const load = async () => {
    try {
      const [w, u] = await Promise.all([api.get('/warehouses'), api.get('/units')]);
      setWarehouses(w.data.data?.items || w.data.items || []);
      setUnits(u.data.data?.items || u.data.items || []);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-black">Warehouse & Units Enterprise</h1>
        <p className="mt-2 text-slate-400">
          Warehouse master data, capacity, stock controls and global unit catalogue.
        </p>
        <div className="mt-5 flex gap-2">
          <button className="rounded bg-emerald-600 px-4 py-2" onClick={() => setTab('warehouses')}>
            Warehouses
          </button>
          <button className="rounded bg-indigo-600 px-4 py-2" onClick={() => setTab('units')}>
            Units
          </button>
        </div>
        {error && <div className="mt-4 rounded bg-red-950 p-3">{error}</div>}
        {tab === 'warehouses' ? (
          <div className="mt-6 overflow-auto rounded-xl bg-slate-900">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="p-3">Code</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th>Capacity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((w) => (
                  <tr key={w._id} className="border-b border-slate-800">
                    <td className="p-3">{w.warehouseCode || w.code}</td>
                    <td>{w.name}</td>
                    <td>{w.type}</td>
                    <td>{[w.city, w.district].filter(Boolean).join(', ')}</td>
                    <td>
                      {w.capacity} {w.capacityUnit}
                    </td>
                    <td>{w.active ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-6 overflow-auto rounded-xl bg-slate-900">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="p-3">Code</th>
                  <th>Name</th>
                  <th>Symbol</th>
                  <th>Category</th>
                  <th>Ratio</th>
                  <th>Precision</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u._id} className="border-b border-slate-800">
                    <td className="p-3">{u.unitCode}</td>
                    <td>{u.name}</td>
                    <td>{u.symbol}</td>
                    <td>{u.category}</td>
                    <td>{u.ratioToBase}</td>
                    <td>{u.decimalPrecision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
