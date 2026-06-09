"use client";

import { ChevronUp } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import { guestRegex } from "@/lib/constants";
import { LoaderIcon } from "./icons";
import { toast } from "./toast";

export function SidebarUserNav() {
  const router = useRouter();
  const { data, status } = useSession();
  const { setTheme, resolvedTheme } = useTheme();

  const email = data?.user?.email ?? "";
  const isGuest = guestRegex.test(email);

  const displayEmail = isGuest ? "Guest" : email || "Unknown user";

  const avatarSrc = email
    ? `https://avatar.vercel.sh/${email}`
    : "https://avatar.vercel.sh/guest";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {status === "loading" ? (
              <SidebarMenuButton className="h-10 justify-between bg-background">
                <div className="flex flex-row gap-2 items-center">
                  <div className="size-6 animate-pulse rounded-full bg-zinc-500/30" />
                  <span className="animate-pulse text-transparent bg-zinc-500/30 rounded-md">
                    Loading auth...
                  </span>
                </div>
                <div className="animate-spin text-zinc-500">
                  <LoaderIcon />
                </div>
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton className="h-10 bg-background">
                <Image
                  alt={displayEmail}
                  className="rounded-full"
                  height={24}
                  width={24}
                  src={avatarSrc}
                />

                <span className="truncate text-sm">{displayEmail}</span>

                <ChevronUp className="ml-auto" />
              </SidebarMenuButton>
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-(--radix-popper-anchor-width)"
            side="top"
          >
            <DropdownMenuItem
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              Toggle {resolvedTheme === "light" ? "dark" : "light"} mode
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => {
                if (status === "loading") {
                  toast({
                    type: "error",
                    description: "Please wait, auth is still loading.",
                  });
                  return;
                }

                if (isGuest) {
                  router.push("/login");
                } else {
                  signOut({ callbackUrl: "/" });
                }
              }}
            >
              {isGuest ? "Login" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
