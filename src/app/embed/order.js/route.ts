import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { orderForms, campaigns, users } from "@/db/schema";
import { buildOrderEmbed } from "@/lib/order-embed";
import { FORM_WIDTH_PX, readAppearance } from "@/lib/order-form-config";
export async function GET(request:Request){
 const slug=new URL(request.url).searchParams.get("form")||"";
 const headers={"Content-Type":"application/javascript; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
 if(!/^[a-f0-9]{24}$/.test(slug))return new Response("// Invalid form",{status:400,headers});
 const [form]=await db.select({tracking:orderForms.tracking,appearance:orderForms.appearance}).from(orderForms).innerJoin(campaigns,eq(campaigns.id,orderForms.campaignId)).innerJoin(users,eq(users.id,orderForms.ownerId)).where(and(eq(orderForms.slug,slug),eq(orderForms.published,true),isNull(orderForms.deletedAt),eq(campaigns.status,"active"),eq(users.isActive,true)));
 // Deliver the iframe even for a paused form, so visitors see the unavailable message.
 const url=new URL(`/f/${slug}`,process.env.APP_URL||request.url).href;
 return new Response(buildOrderEmbed(url,form?.tracking??{},FORM_WIDTH_PX[readAppearance(form?.appearance??{}).width]),{headers});
}
