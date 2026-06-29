export default function ServerInfo() {
  return (
    <div style={{ marginBottom: 24, padding: 16, background: '#eef', borderRadius: 8 }}>
      <h3>Server Component</h3>
      <p>This section is rendered on the server (RSC).</p>
      <p>Wallet interactions happen in the client component below.</p>
    </div>
  );
}
