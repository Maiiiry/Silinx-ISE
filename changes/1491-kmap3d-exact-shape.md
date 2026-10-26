In short:

- The 3D Karnaugh map draws each group as its exact shape through the layers it covers: a group across the map's edges or corners split into the same pieces as in the flat map, open on the edge, and joined between its neighbouring layers by the walls of their closed sides only.

In detail:

- Truth tables: the 3D Karnaugh map of 5 or 6 variables draws a group as the extrusion of its exact 2D shape (`core/kmap3d.js` `kmapSolid`): on each layer it covers the flat map's pieces, flush with the map's edge and without a border where they wrap around it, and between neighbouring layers it covers the walls of the pieces' closed sides, no longer a box of four sides around each piece; a group on the first and last of four layers only has no solid through the layers between (#1491).
