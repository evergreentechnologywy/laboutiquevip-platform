"use strict";
const { PrismaClient } = require("../backend/generated/prisma-client/index.js");
const p = new PrismaClient();
(async () => {
  const valid = new Set(["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"]);
  const fullNames = {"ALABAMA":"AL","ALASKA":"AK","ARIZONA":"AZ","ARKANSAS":"AR","CALIFORNIA":"CA","COLORADO":"CO","CONNECTICUT":"CT","DELAWARE":"DE","FLORIDA":"FL","GEORGIA":"GA","HAWAII":"HI","IDAHO":"ID","ILLINOIS":"IL","INDIANA":"IN","IOWA":"IA","KANSAS":"KS","KENTUCKY":"KY","LOUISIANA":"LA","MAINE":"ME","MARYLAND":"MD","MASSACHUSETTS":"MA","MICHIGAN":"MI","MINNESOTA":"MN","MISSISSIPPI":"MS","MISSOURI":"MO","MONTANA":"MT","NEBRASKA":"NE","NEVADA":"NV","NEW HAMPSHIRE":"NH","NEW JERSEY":"NJ","NEW MEXICO":"NM","NEW YORK":"NY","NORTH CAROLINA":"NC","NORTH DAKOTA":"ND","OHIO":"OH","OKLAHOMA":"OK","OREGON":"OR","PENNSYLVANIA":"PA","RHODE ISLAND":"RI","SOUTH CAROLINA":"SC","SOUTH DAKOTA":"SD","TENNESSEE":"TN","TEXAS":"TX","UTAH":"UT","VERMONT":"VT","VIRGINIA":"VA","WASHINGTON":"WA","WEST VIRGINIA":"WV","WISCONSIN":"WI","WYOMING":"WY","DISTRICT OF COLUMBIA":"DC"};

  const providers = await p.provider.findMany({
    where: { status: "active", NOT: { location_state: null } },
    select: { id: true, location_state: true },
  });
  
  let fixed = 0;
  for (const r of providers) {
    if (!r.location_state) continue;
    const s = r.location_state.trim().toUpperCase();
    if (s.length === 2 && valid.has(s)) continue;
    let code = fullNames[s];
    if (code !== undefined) {
      await p.provider.update({ where: { id: r.id }, data: { location_state: code } });
      fixed++;
    } else {
      await p.provider.update({ where: { id: r.id }, data: { location_state: null } });
      fixed++;
    }
  }
  console.log("Fixed:", fixed, "providers");
  await p.$disconnect();
})();