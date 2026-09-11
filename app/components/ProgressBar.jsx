export default function ProgressBar({ percent }) {
  return (
    <div style={{ height: "8px", borderRadius: "4px", background: "#e1e3e5", overflow: "hidden" }}>
      <div style={{
        height: "100%",
        width: `${percent}%`,
        background: percent === 100 ? "#008060" : "#2c6ecb",
        borderRadius: "4px",
        transition: "width 0.35s ease, background 0.3s ease",
      }} />
    </div>
  );
}
