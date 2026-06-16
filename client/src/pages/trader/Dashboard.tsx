import { useAuthStore } from "../../stores/authStore";

export function Dashboard() {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-2xl font-bold text-gray-900">
        Welcome{user?.displayName ? `, ${user.displayName}` : ""}!
      </h1>
      <p className="mt-2 text-gray-500">
        Your dashboard will be built in upcoming sprints.
      </p>

      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm text-gray-400">Virtual Balance</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">Rs. 50,000.00</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm text-gray-400">Portfolio Value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">—</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm text-gray-400">Profit / Loss</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">—</p>
        </div>
      </div>
    </div>
  );
}
