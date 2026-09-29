import React from 'react';
import { useForgeClient, ForgeButton } from '@bc-forge/react';

export function YourDashboard() {
  const { executeWorkflow, loading, error, data } = useForgeClient();

  const handleAction = async () => {
    await executeWorkflow({ action: 'initialize_vault' });
  };

  return (
    <div>
      <h2>BC-Forge Dashboard</h2>
      <ForgeButton isLoading="{loading}" onClick="{handleAction}">
        Initialize Vault
      </ForgeButton>
      {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}