const iconPaths = {
  northeast: ["M6 18 18 6", "M7 6h11v11"],
  southeast: ["M6 6 18 18", "M18 7v11H7"],
  down: ["M12 4v16", "m5 13 7 7 7-7"],
  up: ["M12 20V4", "m5 11 7-7 7 7"],
  northwest: ["M18 18 6 6", "M17 6H6v11"],
  menu: ["M4 8h16", "M4 16h16"],
  close: ["m6 6 12 12", "M18 6 6 18"],
};

export function LineIcon({ name, className = "" }) {
  return (
    <svg
      className={className}
      data-direction={name}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {iconPaths[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}
