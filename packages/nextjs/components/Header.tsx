"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
};

export const menuLinks: HeaderMenuLink[] = [
  { label: "The Wanted List", href: "/" },
  { label: "Put a Contract Out", href: "/create" },
  { label: "The Code", href: "/code" },
  { label: "My Rap Sheet", href: "/rap-sheet" },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href }) => {
        const isActive = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`${
                isActive ? "text-primary border-primary" : "border-transparent hover:text-primary"
              } font-display text-sm uppercase tracking-widest border-b-2 px-2 py-1 rounded-none`}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </>
  );
};

/**
 * Site header
 */
export const Header = () => {
  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <div
      className="sticky lg:static top-0 navbar bg-base-100 min-h-0 shrink-0 justify-between z-20 px-2 sm:px-4"
      style={{ borderBottom: "1px solid #3D2B1F" }}
    >
      <div className="navbar-start w-auto lg:w-1/2">
        <details className="dropdown" ref={burgerMenuRef}>
          <summary className="ml-1 btn btn-ghost lg:hidden hover:bg-transparent">
            <Bars3Icon className="h-5 w-5" />
          </summary>
          <ul
            className="menu menu-compact dropdown-content mt-3 p-2 shadow-sm bg-base-100 rounded-box w-56"
            onClick={() => {
              burgerMenuRef?.current?.removeAttribute("open");
            }}
          >
            <HeaderMenuLinks />
          </ul>
        </details>
        <Link href="/" passHref className="hidden lg:flex items-center gap-3 ml-2 mr-8 shrink-0">
          <div className="flex flex-col">
            <span className="font-display font-black text-xl leading-none tracking-wide">MOST CLAWD WANTED</span>
            <span className="font-numeric text-[0.6rem] uppercase tracking-[0.3em] opacity-60">
              the community&apos;s most wanted
            </span>
          </div>
        </Link>
        <ul className="hidden lg:flex lg:flex-nowrap menu menu-horizontal px-1 gap-3">
          <HeaderMenuLinks />
        </ul>
      </div>
      <div className="navbar-end grow mr-2">
        <RainbowKitCustomConnectButton />
      </div>
    </div>
  );
};
