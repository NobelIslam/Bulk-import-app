export default function SummaryCard({ value, label, color }) {
  const colors = {
    green:  { bg: "#d4edda", border: "#a3cfbb", text: "#155724" },
    red:    { bg: "#f8d7da", border: "#f1aeb5", text: "#842029" },
    yellow: { bg: "#fff3cd", border: "#ffe083", text: "#856404" },
    grey:   { bg: "#f6f6f7", border: "#e1e3e5", text: "#6d7175" },
  };
  const c = colors[color] || colors.grey;
  return (
    <div style={{
      flex: 1,
      padding: "20px 16px",
      borderRadius: "8px",
      background: c.bg,
      border: `1px solid ${c.border}`,
      textAlign: "center",
    }}>
      <div style={{ fontSize: "36px", fontWeight: "700", color: c.text, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: "13px", color: c.text, marginTop: "6px" }}>
        {label}
      </div>
    </div>
  );
}
