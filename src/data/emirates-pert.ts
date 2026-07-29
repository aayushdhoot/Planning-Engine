// Emirates Mumbai — programme transcribed from 'Emirates PERT Schedule.pdf'
// (Project: Emirates PERT, status date Tue 30 Sep '25), 392 rows.
// Row format: id | parentId | durationDays | start | finish | actualStart | actualFinish | name
// '-' means the source cell was NA/blank. Dates are ISO; the source prints e.g. "Mon 23 Jun '25".
import type { PertCategory, PertNode, PertTree } from '../domain/pert';
import { rollUp } from '../domain/pert';

export const EMIRATES_PERT_SOURCE = 'Emirates PERT Schedule.pdf (status date 2025-09-30)';

const RAW = String.raw`
1|0|245|2025-06-23|2026-02-22|2025-06-23|-|Emirates Mumbai
2|1|90|2025-06-23|2025-09-20|2025-06-23|2025-09-20|Project Milestones
3|2|3|2025-06-23|2025-06-25|2025-06-23|2025-06-25|Kick-off meeting
4|2|1|2025-07-01|2025-07-02|2025-07-01|2025-07-02|Approvals & Kickoff
5|2|1|2025-07-01|2025-07-02|2025-07-01|2025-07-02|Release of PO
6|2|89|2025-06-24|2025-09-20|2025-06-24|2025-09-20|Project Liasioning Approval
7|6|15|2025-09-01|2025-09-15|2025-09-01|2025-09-15|BMC Approvals
8|6|86|2025-06-24|2025-09-20|2025-06-24|2025-09-20|Fire NOC & Mathadi
9|1|129|2025-06-23|2025-10-29|2025-06-24|-|Design
10|9|97|2025-06-23|2025-09-27|2025-06-24|-|GFC and Graphics
11|10|58|2025-06-24|2025-08-20|2025-06-24|2025-08-20|Furniture Layout
12|10|56|2025-06-24|2025-08-20|2025-06-24|2025-08-20|Partition Layout
13|10|54|2025-06-26|2025-08-20|2025-06-26|2025-08-20|Flooring layout
14|10|88|2025-06-26|2025-09-25|2025-06-26|-|Lighting Layout
15|10|88|2025-06-26|2025-09-25|2025-06-26|2025-09-25|RCP
16|10|55|2025-06-26|2025-08-21|2025-06-26|2025-08-21|Funiture dimensions layout
17|10|68|2025-06-26|2025-09-01|2025-06-26|2025-09-01|Modular Furniture Layout
18|10|53|2025-06-26|2025-08-19|2025-06-26|2025-08-19|Wall Finish Drawings
19|10|55|2025-06-26|2025-08-21|2025-06-26|2025-08-21|Room elevation drawings: Civil work
20|10|86|2025-06-30|2025-09-27|2025-06-30|-|Co-ordinated RCP
21|10|15|2025-10-04|2025-10-18|2025-10-04|-|Wallpaper Designs
22|10|10|2025-10-04|2025-10-13|2025-10-04|-|Glass Films Designs
23|10|10|2025-10-04|2025-10-13|2025-10-04|-|Canvas Frames Designs
24|10|15|2025-10-04|2025-10-18|2025-10-04|-|Decorative Lights, Artifacts, Carpentry items Designs
25|10|15|2025-10-04|2025-10-18|2025-10-04|-|Miscellaneous
26|9|56|2025-06-26|2025-08-20|2025-06-26|2025-08-20|3D Views Presentation
27|26|28|2025-06-26|2025-07-24|2025-06-26|2025-07-24|Basic 3D Views
28|26|52|2025-06-26|2025-08-18|2025-06-26|2025-08-18|Detailed 3D Views
29|26|54|2025-06-26|2025-08-20|2025-06-26|2025-08-20|Client 3D Approvals
30|9|40|2025-09-20|2025-10-29|2025-09-20|-|Technical Drawings/ Elevations
31|9|110|2025-06-24|2025-10-11|2025-06-24|-|MEP Drawings
32|31|86|2025-06-24|2025-09-20|2025-06-24|2025-09-20|Electrical/Networking Raceway Layout
33|31|86|2025-06-24|2025-09-20|2025-06-24|2025-09-20|Electrical conduiting Layout
34|31|90|2025-06-24|2025-09-25|2025-06-24|-|Lighting Looping Layout
35|31|90|2025-06-24|2025-09-25|2025-06-24|2025-09-25|Power, Data, Switch Board Layout
36|31|89|2025-06-26|2025-09-26|2025-06-26|-|Electrical SLD Layout
37|31|89|2025-06-26|2025-09-26|2025-06-26|-|Electrical load calculation
38|31|87|2025-06-26|2025-09-24|2025-06-26|-|Plumbing Layout
39|31|88|2025-06-26|2025-09-25|2025-06-26|-|HVAC Heat Load
40|31|88|2025-06-26|2025-09-25|2025-06-26|-|HVAC Layout
41|31|89|2025-06-26|2025-09-26|2025-06-26|-|Fire Sprinkler Layout
42|31|89|2025-06-26|2025-09-26|2025-06-26|-|ACD/CCTV/WIFI Layout
43|31|89|2025-06-26|2025-09-26|2025-06-26|-|FA/PA System Layout
44|31|3|2025-06-27|2025-06-29|-|-|Fire exit signages layout
45|31|3|2025-06-27|2025-06-29|-|-|Fire evacuation plan
46|31|85|2025-06-30|2025-09-26|2025-06-30|-|UPS specifications
47|31|85|2025-06-30|2025-09-26|2025-06-30|-|Critical Areas - Air Conditioning
48|31|85|2025-06-30|2025-09-26|2025-06-30|-|Precision Air Conditioner
49|31|20|2025-06-30|2025-07-20|-|-|Networking - Active Side design
50|31|10|2025-09-26|2025-10-06|-|-|WLD System
51|31|10|2025-09-26|2025-10-06|-|-|Rodent Repellant System
52|31|10|2025-09-26|2025-10-06|-|-|Gas Based Supression System
53|31|10|2025-09-26|2025-10-06|-|-|VESDA
54|31|10|2025-09-26|2025-10-06|-|-|Audio Visual / VC System
55|31|15|2025-09-26|2025-10-11|-|-|BMS Integration
56|31|7|2025-09-26|2025-10-03|-|-|White Goods
57|31|7|2025-09-26|2025-10-03|-|-|Planters - Natural
58|9|30|2025-09-20|2025-10-19|2025-09-20|-|Samples/Mockup Approvals
59|58|4|2025-10-10|2025-10-13|2025-10-10|-|Chairs (Lounge, Cafe)
60|58|4|2025-10-10|2025-10-13|2025-10-10|-|Loose Furniture
61|58|5|2025-09-20|2025-09-24|2025-09-20|2025-09-24|Floor and Dado Tiles
62|58|5|2025-09-20|2025-09-25|2025-09-20|2025-09-25|Carpentary Laminates
63|58|5|2025-09-20|2025-09-25|2025-09-20|2025-09-25|SPC Flooring
64|58|7|2025-09-20|2025-09-27|2025-09-20|2025-09-27|Demountable Glass Partition
65|58|7|2025-09-20|2025-09-27|2025-09-20|2025-09-27|Grid Ceiling
66|58|7|2025-10-10|2025-10-16|2025-10-10|-|Stretch Ceiling
67|58|7|2025-09-20|2025-09-27|2025-09-20|2025-09-27|Decorative Lights
68|58|7|2025-09-20|2025-09-27|2025-09-20|2025-09-27|Blinds
69|58|7|2025-09-20|2025-09-27|2025-09-20|2025-09-27|Backpainted Glass
70|58|7|2025-09-20|2025-09-27|2025-09-20|2025-09-27|Skirting, T Profile
71|58|7|2025-10-10|2025-10-16|2025-10-10|-|Switch Sockets
72|58|7|2025-09-20|2025-09-27|2025-09-20|2025-09-27|Acoustics/Fluted Panel
73|58|7|2025-09-20|2025-09-27|2025-09-20|2025-09-27|Sanitary Fixtures
74|58|7|2025-09-20|2025-09-27|2025-09-20|2025-09-27|Toilet Cubicles Shade
75|58|10|2025-10-10|2025-10-19|2025-10-10|-|Decorative Elements
76|58|7|2025-09-20|2025-09-27|2025-09-20|2025-09-27|Paint Shades
77|58|10|2025-10-10|2025-10-19|2025-10-10|-|Wallpaper, Glass Film, Canvas frames
78|58|5|2025-10-10|2025-10-14|2025-10-10|-|Branding
79|58|8|2025-10-10|2025-10-17|2025-10-10|-|Veneer shades
80|58|8|2025-10-10|2025-10-17|2025-10-10|-|Decorative Lights (sampling)
81|1|68|2025-09-15|2025-11-21|2025-09-15|-|Major Procurement
82|81|7|2025-10-15|2025-10-21|-|-|Cafe furniture Order
83|81|7|2025-11-15|2025-11-21|-|-|Loose Furniture Order
84|81|7|2025-11-15|2025-11-21|-|-|Metal Fire Rated Doors Order
85|81|7|2025-11-01|2025-11-07|-|-|Carpet Order
86|81|7|2025-10-04|2025-10-14|2025-10-04|2025-10-14|Raised Acess flooring Order
87|81|7|2025-10-04|2025-10-10|-|-|Vinyl Flooring Order
88|81|14|2025-10-10|2025-10-23|-|-|Light Fixtures Order
89|81|7|2025-10-11|2025-10-17|-|-|Dado Tiles Order
90|81|7|2025-10-13|2025-10-19|-|-|Vitrified tiles Order
91|81|7|2025-10-13|2025-10-19|-|-|Glass Partition Order
92|81|6|2025-10-20|2025-10-25|-|-|Skirting Order
93|81|6|2025-10-20|2025-10-25|-|-|Blinds Order
94|81|6|2025-10-20|2025-10-25|-|-|Acoustic panels Order
95|81|6|2025-10-20|2025-10-25|-|-|Lacquered Glass Order
96|81|5|2025-10-26|2025-10-30|-|-|Wallpaper Order
97|81|5|2025-10-26|2025-10-30|-|-|Glass Film Order
98|81|7|2025-11-02|2025-11-08|-|-|UPS & Battery Order
99|81|7|2025-11-02|2025-11-08|-|-|Audio Visual/VC System Order
100|81|7|2025-11-02|2025-11-08|-|-|White Goods Order
101|81|7|2025-11-02|2025-11-08|-|-|BMS Services Order
102|81|7|2025-10-03|2025-10-09|-|-|Networking - Cables Order
103|81|46|2025-09-15|2025-10-30|2025-09-15|-|GC Vendor Supply Materials
104|103|26|2025-09-20|2025-10-15|2025-09-20|-|C&I Materials
105|104|7|2025-09-20|2025-09-30|2025-09-20|2025-09-30|Civil Work order
106|104|7|2025-09-20|2025-09-30|2025-09-20|2025-09-30|Gypsum Work Order
107|104|10|2025-10-06|2025-10-15|-|-|Carpentry Work Order
108|104|7|2025-09-20|2025-09-30|2025-09-20|2025-09-30|Paint Order
109|103|8|2025-10-06|2025-10-13|-|-|PHE Materials
110|109|8|2025-10-06|2025-10-13|-|-|Plumbing Pipes order
111|109|7|2025-10-06|2025-10-12|-|-|CP & Sanitary Fixtures Order
112|103|7|2025-10-06|2025-10-12|-|-|Electrical Order
113|103|7|2025-10-15|2025-10-21|-|-|LT Panel Order
114|103|7|2025-10-13|2025-10-19|-|-|Networking Order
115|103|7|2025-10-13|2025-10-19|-|-|HVAC Low Side Order
116|103|7|2025-10-24|2025-10-30|-|-|AHU Order
117|103|7|2025-10-24|2025-10-30|-|-|Critical Areas - Air Conditioning Order
118|103|7|2025-10-24|2025-10-30|-|-|Precision Air Conditioner Order
119|103|18|2025-10-06|2025-10-23|-|-|ELV & FF Materials
120|119|7|2025-10-06|2025-10-12|-|-|Fire Sprinkler Order
121|119|7|2025-10-15|2025-10-21|-|-|Fire Alaram System Order
122|119|7|2025-10-15|2025-10-21|-|-|PA System Order
123|119|6|2025-10-16|2025-10-21|-|-|CCTV Order
124|119|6|2025-10-17|2025-10-22|-|-|Access Control Order
125|119|6|2025-10-18|2025-10-23|-|-|WLD, Rodent Repellent Order
126|119|6|2025-10-18|2025-10-23|-|-|VESDA, Gas Based Supression System Order
127|103|24|2025-09-15|2025-10-08|2025-09-15|-|Miscellaneous Orders
128|127|1|2025-09-15|2025-09-15|2025-09-15|2025-09-15|Pest Control Order
129|127|7|2025-09-20|2025-09-26|-|-|Protection Sheet Order
130|127|2|2025-10-07|2025-10-08|-|-|Deep Cleaning Order
131|1|7|2025-07-20|2025-07-26|-|-|Mobilisation Period
132|1|150|2025-09-26|2026-02-22|2025-09-26|-|Construction Phase
133|132|142|2025-09-26|2026-02-14|2025-09-26|-|C&I Works
134|133|4|2025-09-26|2025-10-01|2025-09-26|-|Waterproofing
135|133|1|2025-09-27|2025-09-27|2025-09-27|2025-09-27|Pest Control
136|133|7|2025-09-30|2025-10-08|2025-09-30|-|Self Leveling
137|133|10|2025-10-12|2025-10-23|-|-|PCC
138|133|7|2025-10-24|2025-10-30|-|-|Modifoam Flooring
139|133|2|2025-10-24|2025-10-25|-|-|Line out Marking
140|133|1|2025-10-26|2025-10-26|-|-|Line out Checking & Approval
141|133|5|2025-10-02|2025-10-06|-|-|Blockwork/RCC Lintel
142|133|5|2025-10-07|2025-10-11|-|-|Plastering
143|133|6|2025-10-07|2025-10-12|-|-|POP Punning
144|133|10|2025-12-03|2025-12-12|-|-|Engineered Concrete Flooring
145|133|25|2025-10-03|2025-10-27|-|-|Dry Wall Partitions
146|145|12|2025-10-03|2025-10-14|-|-|GI Framing Works
147|145|9|2025-10-10|2025-10-18|-|-|Single side single skinning
148|145|3|2025-10-16|2025-10-18|-|-|Clearance from Services
149|145|5|2025-10-15|2025-10-19|-|-|Insulation works
150|145|10|2025-10-18|2025-10-27|-|-|Second side single skinning
151|133|72|2025-11-12|2026-01-22|-|-|Partitions & Doors
152|151|20|2025-11-12|2025-12-01|-|-|Delivery of Modular Glazed Partitions glass
153|151|10|2025-12-02|2025-12-11|-|-|Installation of glass partitions frames
154|151|15|2025-12-12|2025-12-26|-|-|Installation of glass for glazed partitions
155|151|15|2026-01-01|2026-01-15|-|-|Installation of curved glass partition
156|151|7|2026-01-01|2026-01-07|-|-|Installation of solid flush doors
157|151|7|2026-01-01|2026-01-07|-|-|Delivery of Fire Rated Metal Doors
158|151|15|2026-01-08|2026-01-22|-|-|Installation of Fire Rated Metal Doors
159|151|15|2025-12-23|2026-01-06|-|-|Sliding Folding Partition
160|151|15|2026-01-07|2026-01-21|-|-|Switchable smart glass
161|133|24|2025-11-04|2025-11-27|-|-|Raised Flooring Installation
162|161|2|2025-11-04|2025-11-05|-|-|Delivery of Raised Flooring
163|161|3|2025-11-08|2025-11-10|-|-|Marking of Raised Access Flooring
164|161|5|2025-11-11|2025-11-15|-|-|Fixing of Pedestals
165|161|7|2025-11-13|2025-11-19|-|-|Fixing of Raised Flooring Tiles
166|161|4|2025-11-21|2025-11-24|-|-|Cutout for power/data entrys
167|161|5|2025-11-23|2025-11-27|-|-|Alignment of Raised Access Flooring
168|133|110|2025-10-28|2026-02-14|-|-|Flooring
169|168|25|2025-10-28|2025-11-21|-|-|Vitrified Tiling
170|168|20|2025-11-02|2025-11-21|-|-|Marble Flooring
171|168|10|2025-11-22|2025-12-01|-|-|Stone flooring
172|168|15|2026-01-25|2026-02-08|-|-|Carpet Installation
173|168|110|2025-10-28|2026-02-14|-|-|Protection Covering
174|168|10|2026-01-25|2026-02-03|-|-|Wooden raised flooring Installation
175|168|7|2026-01-25|2026-01-31|-|-|Epoxy Flooring
176|133|31|2025-11-14|2025-12-14|-|-|Ceiling
177|176|10|2025-11-14|2025-11-23|-|-|GI Framing for gypsum ceiling
178|176|15|2025-11-25|2025-12-09|-|-|Gypsum boarding & joint finishing
179|176|20|2025-11-25|2025-12-14|-|-|Cafeteria Decorative Ceiling
180|176|15|2025-11-30|2025-12-14|-|-|Metal Fabricated Ceiling
181|176|15|2025-11-30|2025-12-14|-|-|Designer Ceiling
182|133|28|2025-11-14|2025-12-11|-|-|Grid Ceiling
183|182|4|2025-11-14|2025-11-17|-|-|Delivery of Grid Tiles and frames
184|182|10|2025-11-25|2025-12-04|-|-|Framing for Grid Tile installation
185|182|7|2025-12-05|2025-12-11|-|-|Installation of Grid Tiles
186|133|19|2025-11-14|2025-12-02|-|-|Technogrid False Ceiling
187|186|4|2025-11-14|2025-11-17|-|-|Delivery of Tiles and frames
188|186|10|2025-11-18|2025-11-27|-|-|Framing for Tile installation
189|186|5|2025-11-28|2025-12-02|-|-|Installation of technogrid Tiles
190|133|61|2025-11-20|2026-01-19|-|-|Stretch Ceiling
191|190|10|2025-11-20|2025-11-29|-|-|Ply Framing for stretch ceiling installation
192|190|7|2025-12-31|2026-01-06|-|-|Delivery of stretch ceiling material on site
193|190|5|2026-01-15|2026-01-19|-|-|Installation of Stretch Ceiling
194|133|99|2025-11-07|2026-02-13|-|-|Painting
195|194|66|2025-11-07|2026-01-11|-|-|Walls Painting
196|195|10|2025-11-07|2025-11-16|-|-|Putty application (walls)
197|195|10|2025-11-17|2025-11-26|-|-|Primer application & sanding works (walls)
198|195|12|2025-12-01|2025-12-12|-|-|1st coat paint (walls)
199|195|10|2025-12-13|2025-12-22|-|-|2nd & 3rd coat paint (walls)
200|195|20|2025-12-23|2026-01-11|-|-|Epoxy Paint
201|194|42|2025-12-14|2026-01-24|-|-|Ceiling Painting
202|201|10|2025-12-14|2025-12-23|-|-|Putty application (ceiling)
203|201|10|2025-12-24|2026-01-02|-|-|Primer application & sanding works (ceiling)
204|201|12|2026-01-03|2026-01-14|-|-|1st coat paint (ceiling)
205|201|10|2026-01-15|2026-01-24|-|-|2nd & 3rd coat paint (ceiling)
206|194|42|2026-01-03|2026-02-13|-|-|Mettalic Paint
207|206|10|2026-01-03|2026-01-12|-|-|Putty application (metallic)
208|206|10|2026-01-13|2026-01-22|-|-|Primer application & sanding works (metallic)
209|206|12|2026-01-23|2026-02-03|-|-|1st coat paint (metallic)
210|206|10|2026-02-04|2026-02-13|-|-|2nd & 3rd coat paint (metallic)
211|194|42|2026-01-03|2026-02-13|-|-|Stucco Paint
212|211|10|2026-01-03|2026-01-12|-|-|Putty application (stucco)
213|211|10|2026-01-13|2026-01-22|-|-|Primer application & sanding works (stucco)
214|211|12|2026-01-23|2026-02-03|-|-|1st coat paint (stucco)
215|211|10|2026-02-04|2026-02-13|-|-|2nd & 3rd coat paint (stucco)
216|194|7|2025-11-15|2025-11-21|-|-|Wall paper base preparation
217|133|107|2025-10-15|2026-01-29|-|-|Miscallaneous Works
218|217|30|2025-10-15|2025-11-13|-|-|Reception Table
219|217|30|2025-11-14|2025-12-13|-|-|CCM Cabin Table
220|217|30|2025-12-14|2026-01-12|-|-|Board Room Table
221|217|10|2026-01-03|2026-01-12|-|-|Service Counter
222|217|10|2026-01-03|2026-01-12|-|-|Ledge Seating
223|217|15|2025-12-29|2026-01-12|-|-|Acrylic Designer wall work
224|217|10|2026-01-20|2026-01-29|-|-|Pelmet Installation
225|217|40|2025-12-14|2026-01-22|-|-|Built-In Furniture Installation
226|217|7|2026-01-20|2026-01-26|-|-|Blinds Installation
227|217|10|2026-01-20|2026-01-29|-|-|Skirting Installation
228|217|7|2026-01-23|2026-01-29|-|-|Corner Guard Installation
229|217|4|2026-01-26|2026-01-29|-|-|Transition Profile Installation
230|133|103|2025-10-30|2026-02-09|-|-|Wall Finishes
231|230|14|2025-10-30|2025-11-12|-|-|Dado Installation
232|230|15|2026-01-26|2026-02-09|-|-|Wallpaper Installation
233|230|20|2026-01-21|2026-02-09|-|-|Lacquered Glass Panelling
234|230|10|2026-01-31|2026-02-09|-|-|Glass Film Installation
235|230|14|2026-01-13|2026-01-26|-|-|Vertical Garden/Planters
236|230|14|2026-01-13|2026-01-26|-|-|Fluted Panel installation
237|132|37|2025-10-14|2025-11-19|-|-|PHE Works
238|237|1|2025-10-14|2025-10-14|-|-|Marking of plumbing lines
239|237|5|2025-10-15|2025-10-19|-|-|Waterproofing (PHE)
240|237|7|2025-10-20|2025-10-26|-|-|BBC
241|237|13|2025-10-15|2025-10-27|-|-|Water supply system
242|241|7|2025-10-15|2025-10-21|-|-|Pipes Installation (supply)
243|241|6|2025-10-22|2025-10-27|-|-|Fittings Installation (supply)
244|237|36|2025-10-15|2025-11-19|-|-|Water drainage system
245|244|10|2025-10-15|2025-10-24|-|-|Pipes Installation (drainage)
246|244|7|2025-10-25|2025-10-31|-|-|Fittings Installation (drainage)
247|244|7|2025-11-01|2025-11-07|-|-|Pumps Installation
248|244|10|2025-11-08|2025-11-17|-|-|Sanitary Fixtures Installation
249|244|2|2025-11-18|2025-11-19|-|-|Testing & Commissioning of Plumbing Line
250|132|135|2025-09-30|2026-02-11|2025-09-30|-|Electrical Works
251|250|5|2025-09-30|2025-10-04|2025-09-30|2025-10-04|Temporary Lighting work
252|250|22|2025-10-19|2025-11-09|-|-|Conduit & Wiring
253|252|5|2025-10-19|2025-10-23|-|-|Conduit marking in closed room partitions
254|252|10|2025-10-24|2025-11-02|-|-|Conduiting for Raw Power, UPS, lighting, IT
255|252|7|2025-10-29|2025-11-04|-|-|Back box fixing
256|252|12|2025-10-29|2025-11-09|-|-|Wiring for light circuits
257|252|12|2025-10-29|2025-11-09|-|-|Wiring for Power Circuits
258|250|33|2025-10-31|2025-12-02|-|-|Raceway & Cable Tray
259|258|6|2025-10-31|2025-11-05|-|-|Marking of floor raceway
260|258|7|2025-11-06|2025-11-12|-|-|Support fixing for raceway
261|258|10|2025-11-13|2025-11-22|-|-|Installation of floor Raceway for Power & Data
262|258|7|2025-11-23|2025-11-29|-|-|Junction, GI Boxes Installation
263|258|3|2025-11-06|2025-11-08|-|-|Marking for ceiling cable tray
264|258|10|2025-11-09|2025-11-18|-|-|Support fixing for cable tray
265|258|14|2025-11-19|2025-12-02|-|-|Installation of cable tray for IT/Data/Electrical
266|250|32|2025-11-10|2025-12-11|-|-|Power & Earthing Cabling
267|266|15|2025-11-10|2025-11-24|-|-|Cabling for power
268|266|10|2025-11-25|2025-12-04|-|-|Cabling for earthing
269|266|7|2025-12-05|2025-12-11|-|-|Cabling dressing
270|250|45|2025-11-28|2026-01-11|-|-|DB & LT Panels
271|270|7|2025-11-28|2025-12-04|-|-|Installation of DBs
272|270|5|2025-12-05|2025-12-09|-|-|DB Dressing and Termination
273|270|7|2025-12-25|2026-01-01|-|-|Delivery of LT Panels
274|270|7|2026-01-01|2026-01-08|-|-|Installation of LT Panels
275|270|3|2026-01-08|2026-01-11|-|-|Panel Testing and commissioning
276|250|49|2025-12-09|2026-01-26|-|-|UPS & Battery
277|276|7|2026-01-08|2026-01-14|-|-|Supply Of Ups
278|276|7|2025-12-09|2025-12-15|-|-|Supply Of Battery
279|276|5|2026-01-15|2026-01-19|-|-|Installation of UPS
280|276|5|2026-01-20|2026-01-24|-|-|Installation of Battery Systems
281|276|2|2026-01-20|2026-01-21|-|-|Testing & Commissioning of UPS
282|276|2|2026-01-25|2026-01-26|-|-|Testing & Commissioning of Battery
283|250|7|2026-02-05|2026-02-11|-|-|Switches & Sockets
284|283|7|2026-02-05|2026-02-11|-|-|Installation of Switches, Raw Power Sockets
285|250|10|2026-01-15|2026-01-24|-|-|Light Fixtures
286|285|10|2026-01-15|2026-01-24|-|-|Installation of recessed lights in closed rooms
287|285|7|2026-01-15|2026-01-21|-|-|Installation of suspended light fixtures in w/s area
288|285|5|2026-01-15|2026-01-19|-|-|Installation of Decorative light fixtures
289|250|3|2026-01-22|2026-01-24|-|-|Testing & Commissioning of Electrical system
290|132|109|2025-10-31|2026-02-16|-|-|HVAC Works
291|290|4|2025-10-31|2025-11-03|-|-|Marking & Support fixing of Ducts
292|290|10|2025-11-04|2025-11-13|-|-|Installation of Ducts
293|290|10|2025-11-14|2025-11-23|-|-|Insulation for ducts
294|290|7|2025-11-24|2025-11-30|-|-|Grills, Diffusers Installation
295|290|5|2025-12-01|2025-12-05|-|-|Installation of VAVs
296|290|30|2025-12-19|2026-01-17|-|-|Supply of AHU
297|290|10|2026-01-18|2026-01-27|-|-|Installation of AHU
298|290|10|2026-01-28|2026-02-06|-|-|Installation of fire Dampers, actuators
299|290|7|2026-02-07|2026-02-13|-|-|Acoustic insulation of AHU room
300|290|7|2026-02-07|2026-02-13|-|-|Fire damper control panels Installation
301|290|3|2026-02-14|2026-02-16|-|-|AHU dry run
302|132|112|2025-10-31|2026-02-19|-|-|Critical Areas - HVAC System
303|302|7|2025-10-31|2025-11-06|-|-|Cable trays Installation for copper piping
304|302|10|2025-11-07|2025-11-16|-|-|Copper piping works
305|302|7|2025-11-17|2025-11-23|-|-|Drain Piping works
306|302|4|2025-11-17|2025-11-20|-|-|Installation of VRF units
307|302|3|2026-02-17|2026-02-19|-|-|Testing & Commissioning of HVAC system
308|132|25|2026-01-09|2026-02-02|-|-|Precision Air Conditioner
309|308|15|2026-01-09|2026-01-23|-|-|Supply of Precision Air Conditioners
310|308|10|2026-01-24|2026-02-02|-|-|Installation of Precision Air Conditioners
311|132|83|2025-10-13|2026-01-03|-|-|ELV & FF
312|311|46|2025-10-13|2025-11-27|-|-|Sprinkler System
313|312|4|2025-10-13|2025-10-16|-|-|Marking & supports fixing for fire pipes
314|312|10|2025-10-17|2025-10-26|-|-|Modification of existing fire pipes
315|312|5|2025-10-27|2025-10-31|-|-|Modification of existing sprinkler bulbs
316|312|10|2025-11-01|2025-11-10|-|-|Erection of MS sprinkler pipes
317|312|10|2025-11-11|2025-11-20|-|-|Enamel painting of pipes
318|312|7|2025-11-11|2025-11-17|-|-|Flexible pipes installation for below false ceiling
319|312|7|2025-11-18|2025-11-24|-|-|Pendent, Upright sprinkler bulbs installation
320|312|3|2025-11-25|2025-11-27|-|-|Testing & Commissioning of sprinkler system
321|311|79|2025-10-17|2026-01-03|-|-|Fire Alarm System
322|321|20|2025-10-17|2025-11-05|-|-|FA Cabling on ceiling
323|321|9|2025-11-06|2025-11-14|-|-|FA Cabling on walls/partitions
324|321|14|2025-11-15|2025-11-28|-|-|Multi Sensor Detectors Installation
325|321|7|2025-11-29|2025-12-05|-|-|Heat detectors Installation
326|321|7|2025-12-06|2025-12-12|-|-|RI installation
327|321|7|2025-12-13|2025-12-19|-|-|Modules/MCP/Strobes Installation
328|321|15|2025-12-20|2026-01-03|-|-|Testing & Commissioning of FA system
329|311|31|2025-11-23|2025-12-23|-|-|Public Addressing system
330|329|20|2025-11-23|2025-12-12|-|-|PA cabling
331|329|7|2025-12-13|2025-12-19|-|-|Speakers Installation
332|329|4|2025-12-20|2025-12-23|-|-|Testing & Commissioning of PA system
333|311|31|2025-11-23|2025-12-23|-|-|ACS and CCTV System
334|333|10|2025-11-23|2025-12-02|-|-|Conduiting & Installation of raceways (ACS)
335|333|10|2025-12-03|2025-12-12|-|-|Cabling (ACS/CCTV)
336|333|7|2025-12-13|2025-12-19|-|-|Installation of ACS & CCTV devices
337|333|4|2025-12-20|2025-12-23|-|-|Testing and commisioning of ACS & CCTV works
338|311|36|2025-12-12|2026-01-16|-|-|WLD System
339|338|10|2025-12-12|2025-12-21|-|-|Conduiting & Installation of Raceway (WLD)
340|338|10|2025-12-22|2025-12-31|-|-|Cabling (WLD)
341|338|7|2026-01-08|2026-01-14|-|-|Installation of WLD Devices
342|338|2|2026-01-15|2026-01-16|-|-|Testing and commissioning of WLD System
343|311|31|2025-12-12|2026-01-11|-|-|Rodent Repelent System
344|343|10|2025-12-12|2025-12-21|-|-|Conduiting & Installation of Raceway (Rodent)
345|343|7|2025-12-22|2025-12-28|-|-|Cabling (Rodent)
346|343|5|2026-01-05|2026-01-09|-|-|Installation of Rodent Repelent Devices
347|343|2|2026-01-10|2026-01-11|-|-|Testing and commissioning of Rodent Repelent System
348|311|34|2025-12-12|2026-01-14|-|-|Gas Based Supression System
349|348|10|2025-12-12|2025-12-21|-|-|Supply of Gas Based Supression System
350|348|7|2026-01-06|2026-01-12|-|-|Installation of Gas Based Supression System
351|348|2|2026-01-13|2026-01-14|-|-|Testing and commissioning (gas suppression)
352|132|103|2025-10-25|2026-02-04|-|-|Passive Networking works
353|352|30|2025-10-25|2025-11-23|-|-|Cable laying
354|352|10|2026-01-26|2026-02-04|-|-|I/O port terminations
355|132|35|2025-12-25|2026-01-28|-|-|Active Networking Works
356|355|15|2025-12-25|2026-01-08|-|-|Supply of Fiber Cables
357|355|10|2026-01-09|2026-01-18|-|-|Supply of Backbone Cables
358|355|10|2026-01-09|2026-01-18|-|-|Supply of Network Racks
359|355|10|2026-01-09|2026-01-18|-|-|Cables Installation
360|355|5|2026-01-19|2026-01-23|-|-|Server Room Readiness
361|355|7|2026-01-19|2026-01-25|-|-|Network Rack Installation
362|355|3|2026-01-26|2026-01-28|-|-|Testing and Commissioning (networking)
363|132|20|2026-02-01|2026-02-20|-|-|AV Systems
364|363|10|2026-02-01|2026-02-10|-|-|AV Cabling
365|363|5|2026-02-11|2026-02-15|-|-|AV Systems delivery
366|363|5|2026-02-16|2026-02-20|-|-|AV Systems Installation
367|132|9|2026-02-12|2026-02-20|-|-|White Goods
368|367|2|2026-02-12|2026-02-13|-|-|Supply of White Goods
369|367|3|2026-02-18|2026-02-20|-|-|Installation of White Goods
370|132|86|2025-11-13|2026-02-06|-|-|Modular Workstation, Meeting Room Tables
371|370|4|2025-11-13|2025-11-16|-|-|Marking of workstations, meeting room tables
372|370|25|2025-12-17|2026-01-10|-|-|Workstation frame, meeting room table installation
373|370|15|2026-01-11|2026-01-25|-|-|Routing of power, data cables & socket fixing
374|370|10|2026-01-26|2026-02-04|-|-|Fixing of table top, panels for workstations
375|370|2|2026-02-05|2026-02-06|-|-|Alignment of workstations, meeting room tables
376|132|26|2025-12-24|2026-01-18|-|-|Modular Cubicles
377|376|3|2025-12-24|2025-12-26|-|-|Site Measurement for Modular Cubicle
378|376|3|2025-12-27|2025-12-29|-|-|Cubicle Material Delivery
379|376|20|2025-12-30|2026-01-18|-|-|Cubicle Installation
380|132|23|2026-01-28|2026-02-19|-|-|Loose Furniture & Material
381|380|10|2026-01-28|2026-02-06|-|-|Delivery of Loose furniture
382|380|3|2026-02-07|2026-02-09|-|-|Installation of Loose furniture
383|380|7|2026-01-30|2026-02-05|-|-|Supply & Installation of Lockers
384|380|7|2026-02-13|2026-02-19|-|-|Supply of Chairs Materials
385|380|7|2026-02-13|2026-02-19|-|-|Installation Chairs
386|1|18|2026-02-05|2026-02-22|-|-|Handing Over Phase
387|386|3|2026-02-05|2026-02-07|-|-|Signages Supply and Installation
388|386|3|2026-02-17|2026-02-19|-|-|Branding (Logo)
389|386|3|2026-02-20|2026-02-22|-|-|Fire extinguishers Installation
390|386|4|2026-02-19|2026-02-22|-|-|Fire exit signages Installation
391|386|4|2026-02-19|2026-02-22|-|-|Fire evacuation maps Installation
392|386|5|2026-02-18|2026-02-22|-|-|Deep Cleaning
`;

/** Which top-level branch each category owns. */
const CATEGORY_OF_ROOT: Record<number, PertCategory> = {
  2: 'schedule',
  9: 'design',
  81: 'procurement',
  131: 'execution',
  132: 'execution',
  386: 'execution',
};

interface Row {
  id: number;
  parent: number;
  dur: number;
  start: string | null;
  finish: string | null;
  as: string | null;
  af: string | null;
  name: string;
}

function parseRows(): Row[] {
  return RAW.trim()
    .split('\n')
    .map((line) => {
      const [id, parent, dur, start, finish, as, af, ...rest] = line.split('|');
      const d = (v: string) => (v === '-' ? null : v);
      return {
        id: Number(id),
        parent: Number(parent),
        dur: Number(dur),
        start: d(start),
        finish: d(finish),
        as: d(as),
        af: d(af),
        name: rest.join('|'),
      };
    });
}

export function buildEmiratesPert(today: string): PertTree {
  const rows = parseRows();
  const byId = new Map<number, PertNode>();
  const childrenOf = new Map<number, number[]>();
  for (const r of rows) {
    const list = childrenOf.get(r.parent) ?? [];
    list.push(r.id);
    childrenOf.set(r.parent, list);
  }

  const categoryFor = (id: number): PertCategory => {
    let cur = id;
    const seen = new Set<number>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (CATEGORY_OF_ROOT[cur]) return CATEGORY_OF_ROOT[cur];
      cur = rows.find((r) => r.id === cur)?.parent ?? 0;
    }
    return 'schedule';
  };

  const levelOf = (id: number): number => {
    let n = 0;
    let cur = rows.find((r) => r.id === id)?.parent ?? 0;
    const seen = new Set<number>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      n++;
      cur = rows.find((r) => r.id === cur)?.parent ?? 0;
    }
    return n;
  };

  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      name: r.name,
      level: levelOf(r.id),
      category: categoryFor(r.id),
      durationDays: r.dur,
      start: r.start,
      finish: r.finish,
      actualStart: r.as,
      actualFinish: r.af,
      isSummary: (childrenOf.get(r.id) ?? []).length > 0,
      children: [],
      percentComplete: 0,
      status: 'not_started',
    });
  }
  for (const r of rows) {
    const parent = byId.get(r.parent);
    if (parent) parent.children.push(byId.get(r.id)!);
  }

  const root = byId.get(1)!;
  rollUp([root], today);

  const byCategory = { schedule: [], design: [], procurement: [], execution: [] } as Record<PertCategory, PertNode[]>;
  for (const child of root.children) byCategory[child.category].push(child);

  return { root, byCategory, totalTasks: rows.length, source: EMIRATES_PERT_SOURCE };
}
