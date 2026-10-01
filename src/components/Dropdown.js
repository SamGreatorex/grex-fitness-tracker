"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./Dropdown.module.css";

// A single-choice dropdown in the app's theme. Native <select>s can't be
// used for this: their open list is drawn by the OS (macOS, iOS, Android)
// and ignores CSS, so it shows up as a light system menu.
//
// `options` is a list of { value, label }, and may include groups:
// { label, options: [{ value, label }] }. `onChange` gets the new value.
// The list opens in the top layer (the Popover API), so it's never clipped
// by — and always sits above — a <dialog> or scrolling container. It closes
// on outside click, Escape, Tab, scroll or resize.
export default function Dropdown({
  value,
  onChange,
  options,
  placeholder = "Choose…",
  disabled = false,
  variant,
  className = "",
  id,
  title,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}) {
  const listId = useId();
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const typeahead = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState(null);

  // Groups flattened for keyboard navigation; rows keep group headings in place.
  const flat = [];
  const rows = [];
  for (const item of options) {
    if (item.options) {
      rows.push({ heading: item.label });
      for (const option of item.options) rows.push({ option, index: flat.push(option) - 1 });
    } else {
      rows.push({ option: item, index: flat.push(item) - 1 });
    }
  }
  const selectedIndex = flat.findIndex((o) => o.value === value);
  const selected = flat[selectedIndex];

  const openMenu = () => {
    if (disabled) return;
    // Below the trigger, or above it if there's clearly more room there.
    const r = triggerRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 220 && above > below;
    setPosition({
      left: r.left,
      minWidth: r.width,
      maxWidth: window.innerWidth - r.left - 8,
      maxHeight: Math.min(320, up ? above : below),
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const closeMenu = ({ refocus = true } = {}) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const choose = (option) => {
    if (option.value !== value) onChange(option.value);
    closeMenu();
  };

  // Show/hide in the top layer, and move focus into the list so the
  // keyboard drives it.
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    if (open && !menu.matches(":popover-open")) {
      menu.showPopover();
      menu.focus({ preventScroll: true });
    } else if (!open && menu.matches(":popover-open")) {
      menu.hidePopover();
    }
  }, [open]);

  // Outside click, scroll (of anything but the list itself) or resize closes it.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (e) => {
      if (!menuRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) close();
    };
    const onScroll = (e) => {
      if (!menuRef.current?.contains(e.target)) close();
    };
    const onResize = close;
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // Keep the highlighted option in view as the arrow keys move it — by
  // scrolling the list only (scrollIntoView could scroll the page behind it).
  useEffect(() => {
    const menu = menuRef.current;
    const el = open && activeIndex >= 0 ? document.getElementById(`${listId}-${activeIndex}`) : null;
    if (!menu || !el) return;
    if (el.offsetTop < menu.scrollTop) {
      menu.scrollTop = el.offsetTop - 6;
    } else if (el.offsetTop + el.offsetHeight > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = el.offsetTop + el.offsetHeight - menu.clientHeight + 6;
    }
  }, [open, activeIndex, listId]);

  const onTriggerKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openMenu();
    }
  };

  const onMenuKeyDown = (e) => {
    const last = flat.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(last, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(last);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (flat[activeIndex]) choose(flat[activeIndex]);
        break;
      case "Escape":
        // Don't let it also close a surrounding <dialog>.
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        break;
      case "Tab":
        closeMenu({ refocus: false });
        break;
      default:
        // Type-ahead: jump to the first option starting with what's typed.
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const now = e.timeStamp;
          const t = typeahead.current;
          t.text = (now - t.at < 700 ? t.text : "") + e.key.toLowerCase();
          t.at = now;
          const match = flat.findIndex((o) => String(o.label).toLowerCase().startsWith(t.text));
          if (match >= 0) setActiveIndex(match);
        }
    }
  };

  return (
    <div className={`${styles.root} ${variant === "pill" ? styles.pill : ""} ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={`${styles.value} ${selected ? "" : styles.placeholder}`}>{selected ? selected.label : placeholder}</span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>

      <div
        ref={menuRef}
        id={listId}
        popover="manual"
        role="listbox"
        tabIndex={-1}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        className={styles.menu}
        style={position ?? undefined}
        onKeyDown={onMenuKeyDown}
      >
        {flat.length === 0 && <div className={styles.empty}>Nothing to choose from.</div>}
        {rows.map((row, i) =>
          row.heading ? (
            <div key={`h${i}`} className={styles.groupLabel} role="presentation">
              {row.heading}
            </div>
          ) : (
            <div
              key={`o${i}`}
              id={`${listId}-${row.index}`}
              role="option"
              aria-selected={row.option.value === value}
              className={`${styles.option} ${row.index === activeIndex ? styles.optionActive : ""} ${
                row.option.value === value ? styles.optionSelected : ""
              }`}
              onPointerEnter={() => setActiveIndex(row.index)}
              onClick={() => choose(row.option)}
            >
              <span className={styles.check} aria-hidden="true">
                {row.option.value === value ? "✓" : ""}
              </span>
              <span className={styles.optionLabel}>{row.option.label}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
