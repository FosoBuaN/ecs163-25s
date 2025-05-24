/* Follow template convention and update entries value to corresponding types.
    There is a good chunk of data that won't be processed and therefore left unconverted.
     */
d3.csv("data/ds_salaries.csv").then(rawData => {
    console.log("rawData", rawData);

    // Casting salary and work location info that we're gonna use from string to int
    rawData.forEach(function (d) {
        d.salary_in_usd = Number(d.salary_in_usd);
        d.remote_ratio = Number(d.remote_ratio);
    });

    // Map for roles to salary
    let positionSalary = new Map();
    let filteredData = new Map();

    // Modular function to process all the data i need in one place
    function processData(data, yearRange = null) {
        positionSalary = new Map();
        filteredData = new Map();

        data.forEach(d => {
            const role = d.job_title; // Extract title
            const salary = d.salary_in_usd; // Extract salary according to this user
            const year = +d.work_year; // Extract their work year of survey report

            // This is for interactive filter. Drop current `d` if not in range.
            if (yearRange && (year < yearRange[0] || year > yearRange[1])) return;

            // Process for box plot
            if (!positionSalary.get(role)) {
                // For a specific role gen low, avg, high, and tmp array for compute avg
                positionSalary.set(role, { low: salary, avg: salary, high: salary, tmp: [salary] });
            } else {
                // Trivial math. move on
                let v = positionSalary.get(role);
                v.tmp.push(salary);
                v.low = Math.min(v.low, salary);
                v.high = Math.max(v.high, salary);
                v.avg = v.tmp.reduce((sum, val) => sum + val, 0) / v.tmp.length;
            }

            // Process for line plot
            if (!filteredData.get(role)) {
                // Set up a map for the current role. Will store each year and array of salaries reported.
                filteredData.set(role, { [year]: [salary] });
            } else {
                let v = filteredData.get(role);
                // New year detected then make an entry
                if (!v[year]) {
                    v[year] = [salary];
                // Not new year simply append to list
                } else {
                    v[year].push(salary);
                }
            }
        });

        // Deleting position vs salary relations of those with 15 or less reported.
        // Reduces clutter tbh
        for (const [pos, d] of positionSalary) {
            if (d.tmp.length < 15) {
                positionSalary.delete(pos);
            } else {
                delete d.tmp;
                d.avg = Math.round(d.avg);
            }
        }

        // Doing the same thing for uhm this set of data for line graph
        for (const [role, v] of filteredData) {
            let total = 0;
            for (let yr of Object.values(v)) total += yr.length;
            if (total < 15) {
                // If your year has less than 15 entries then removed
                filteredData.delete(role);
            } else {
                for (let [year, arr] of Object.entries(v)) {
                    v[year] = Math.round(arr.reduce((acc, val) => acc + val, 0) / arr.length);
                }
            }
        }
    }

    // Function to render my top left corner weird fake box plot
    function renderBox(selectedRole = null) {
        const yearRange = d3.select("#line-svg").attr("data-year-range"); // Attribute record for dynamic title
        const svg = d3.select("#box-svg"); // prebuilt html
        // Below all that width is for dynamic resizing based on the parent container: prebuilt html.
        const { width, height } = svg.node().parentNode.getBoundingClientRect(); 
        const margin = { top: 30, right: 20, bottom: 50, left: 100 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        svg.attr("width", width).attr("height", height);

        // Extracting data into d3 happy format
        const data = Array.from(positionSalary.entries()).map(([role, vals]) => ({ role, ...vals }));

        // Setting x axis scale
        const x = d3.scaleLinear()
            .domain([d3.min(data, d => d.low), d3.max(data, d => d.high)]) // Our data input "range"
            .range([0, innerWidth]); // The actual spacing, lame... e.e

        // Setting y axis scale
        const y = d3.scaleBand()
            .domain(data.map(d => d.role)) // Roles
            .range([0, innerHeight])
            .padding(0.3);

        svg.selectAll("*").remove(); // Remove everything just in case. Though there really shouldn't be.
        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

        // Draw bottom axis
        g.append("g")
            .attr("transform", `translate(0,${innerHeight})`)
            .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("$.2s")));

        // Draw left axis
        g.append("g")
            .call(d3.axisLeft(y))
            .selectAll("text")
            .style("font-size", "6px");

        // Add our bottom caption
        svg.append("text")
            .attr("x", margin.left + innerWidth / 2)
            .attr("y", height - 10)
            .attr("text-anchor", "middle")
            .text("Salary ($)")
            .attr("font-size", "12px");

        // Add titles
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", 20)
            .attr("text-anchor", "middle")
            .text(yearRange ? `Salary Ranges by Position (${yearRange})` : "Salary Ranges by Position")
            .attr("font-size", "14px")
            .attr("font-weight", "bold");

        // Add those weird lines. Be nice to add mouseover to show low/high. too lazy now
        g.selectAll(".whisker")
            .data(data)
            .enter()
            .append("line")
            .attr("class", "whisker")
            .attr("x1", d => x(d.low))
            .attr("x2", d => x(d.high))
            .attr("y1", d => y(d.role) + y.bandwidth() / 2)
            .attr("y2", d => y(d.role) + y.bandwidth() / 2)
            .attr("stroke", "#666")
            .attr("stroke-width", 2)
            .transition().duration(800);

        // Cool interaction. Draws the blue colored average dot. Can click.
        g.selectAll(".avg-dot")
            .data(data)
            .enter()
            .append("circle")
            .attr("class", "avg-dot")
            .attr("cx", d => x(d.avg))
            .attr("cy", d => y(d.role) + y.bandwidth() / 2)
            .attr("r", 4)
            .attr("fill", d => selectedRole === d.role ? "orange" : "steelblue")
            .on("click", function(d) {
                renderBox(d.role); // This does like 1 thing and that's change color to orange e.e
                renderLine(d.role);
            });
    }

    // Render my top right line chart.
    function renderLine(selectedRole = null) {
        const yearRange = d3.select("#line-svg").attr("data-year-range"); // For dynamic title
        const svg = d3.select("#line-svg"); // prebuilt html

        // For dynamic resize
        const { width, height } = svg.node().parentNode.getBoundingClientRect();
        const margin = { top: 30, right: 20, bottom: 50, left: 60 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        svg.attr("width", width).attr("height", height + 50);
        svg.selectAll("*").remove(); // Safety

        const rawDataMap = selectedRole ? new Map([[selectedRole, filteredData.get(selectedRole)]]) : filteredData;

        const years = [2020, 2021, 2022, 2023]; // Hard coded year cause y not
        const data = Array.from(rawDataMap.entries()).map(([role, yearMap]) => {
            // Extract the weird role -> object where object contains (year,array) key pairs. array of salaries
        const values = years
            .map(year => ({ year, salary: yearMap[year] }))
            .filter(d => typeof d.salary === 'number' && !isNaN(d.salary)); // prevents undefined stuff
        return { role, values };
    }).filter(d => d.values.length >= 2); // make sure at least two points so i can draw line.

        // scales for x and y axis
        const x = d3.scaleLinear().domain(d3.extent(years)).range([0, innerWidth]);
        const y = d3.scaleLinear()
            .domain([
                d3.min(data, d => d3.min(d.values, v => v.salary)),
                d3.max(data, d => d3.max(d.values, v => v.salary))
            ])
            .range([innerHeight, 0]);

        // this one is kinda just high level generality so no custom color.
        const colors = d3.schemeTableau10.concat(d3.schemeSet3);
        const color = d3.scaleOrdinal(colors).domain(data.map(d => d.role));

        // Build the graph
        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        // Add bottom line and ticks
        g.append("g").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x).ticks(4).tickFormat(d3.format("d")));
        // Add left line and ticks
        g.append("g").call(d3.axisLeft(y).tickFormat(d3.format("$.2s")));

        // Draw the lines accordingly
        const line = d3.line()
            .defined(d => typeof d.salary === 'number' && !isNaN(d.salary))
            .x(d => x(d.year))
            .y(d => y(d.salary));

        // Give each line attributes and color
        g.selectAll(".line")
            .data(data)
            .enter()
            .append("path")
            .attr("class", "line")
            .attr("fill", "none")
            .attr("stroke", d => color(d.role))
            .attr("stroke-width", 2)
            .attr("d", d => line(d.values))
            .transition().duration(600);

        // Cool brush for interaction
        const brush = d3.brushX()
            .extent([[0, 0], [innerWidth, innerHeight]])
            .on("end", function() { // Defines what to do after brush interval completes
                const selection = d3.event.selection;
                if (!selection) return;
                const [x0, x1] = selection;
                const yr0 = Math.round(x.invert(x0));
                const yr1 = Math.round(x.invert(x1));
                processData(rawData, [yr0, yr1]);
                d3.select("#line-svg").attr("data-year-range", `${yr0}-${yr1}`);
                renderBox();
                renderLine(); // This just rerenders the portion of line in scope
            });

        g.append("g").attr("class", "brush").call(brush); // Event listener plugged

        // X axis caption
        svg.append("text").attr("x", margin.left + innerWidth / 2).attr("y", height - 20).attr("text-anchor", "middle").text("Year");
        // Y Axis caption
        svg.append("text").attr("transform", `translate(15, ${margin.top + innerHeight / 2}) rotate(-90)`).attr("text-anchor", "middle").text("Salary");
        // Title
        svg.append("text").attr("x", width / 2).attr("y", 20).attr("text-anchor", "middle").attr("font-size", "14px").attr("font-weight", "bold").text(yearRange ? `Average Salary Trends by Role From ${yearRange}`:"Average Salary Trends by Role From 2020-2023");

        // Add legend
        const legendY = margin.top + innerHeight + 30;  // 30px below the chart area

        // Add another chunk
        const legend = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${legendY})`);

        // Extract all roles from data
        const roles = data.map(d => d.role);
        // Legend config parameters
        const legendCols = 4;
        const itemsPerCol = Math.ceil(roles.length / legendCols);
        const legendSpacingX = 125;
        const legendSpacingY = 12;

        // Process each role and assign it a color
        roles.forEach((role, i) => {
            const col = Math.floor(i / itemsPerCol); // Decide how many cols to have based on config
            const row = i % itemsPerCol;

            // Define the spacing
            const gLegend = legend.append("g")
                .attr("transform", `translate(${col * legendSpacingX}, ${row * legendSpacingY})`);

            // Draw our roles with color
            gLegend.append("rect")
                .attr("width", 10)
                .attr("height", 10)
                .attr("fill", color(role));

            // Give it label
            gLegend.append("text")
                .attr("x", 15)
                .attr("y", 8)
                .attr("font-size", "8px")
                .text(role);
        });
    }

    // Random function for sankey internal interaction.
    function renderPie(container, data) {
        // Force known working size regardless of overlay size
        const width = container.node().clientWidth;
        const height = container.node().clientHeight;
        const radius = Math.min(width, height) / 2;

        // Append SVG with a clear background
        const svg = container.append("svg")
            .attr("width", width)
            .attr("height", height)
            .style("display", "block")
            .style("z-index", "1001")
            .style("pointer-events", "auto") // avoids blocking hover/clicks
            .append("g")
            .attr("transform", `translate(${width / 2}, ${height / 2})`);

        // Pie setup
        // color sync with sankey for pretty
        const color = 
                        {
            "<50k": "#deebf7",       // lightest = smallest
            "50k-150k": "#9ecae1",
            "150k-200k": "#3182bd",
            ">200k": "#08519c",       // darkest = largest
            "Entry Level": "#fee0d2",      
            "Mid-Level": "#fc9272",
            "Executive": "#de2d26",
            "Senior Executive": "#a50f15",  
            };
        const pie = d3.pie().value(d => d.value);
        const arc = d3.arc().innerRadius(0).outerRadius(radius);
        console.log(data);

        // Self defined tooltip to allow mouseover show info effect.
        const tooltip = d3.select("body")
            .append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("padding", "5px 8px")
            .style("background", "rgba(0,0,0,0.7)")
            .style("color", "#fff")
            .style("border-radius", "4px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("opacity", 0);


        const totalValue = d3.sum(data.map((d)=>d.value)); // math. for compute % weight.

        // draw slices
        svg.selectAll("path")
            .data(pie(data))
            .enter()
            .append("path")
            .attr("d", arc)
            .attr("fill", (d, i) => color[d.data.label])
            .on("mouseover", function(d) {
                console.log("triggered");
                tooltip.style("opacity", 1)
                .html(`${d.data.label}: ${d.data.value} (${((d.data.value / totalValue) * 100).toFixed(2)}%)`)
                .style("left", (d3.event.pageX + 10) + "px")
                .style("top", (d3.event.pageY + 10) + "px");
            })
            .on("mouseout", function() {
                tooltip.style("opacity", 0);
            });
        
        // Title
        svg.append("text")
        .attr("x", 0)  // Center horizontally
        .attr("y", -radius)  // Adjust vertical position
        .attr("text-anchor", "middle")  // Centers text horizontally at x position
        .attr("font-size", "14px")
        .attr("font-weight", "bold")
        .text("Who're these people?");  // Replace this with your desired title text
    }


    function renderSankey() {
        let data = rawData;
        // Define helper functions for node separations
        function salaryBucket(s) {
            const sal = +s;
            if (sal < 50000) return "<50k";
            if (sal < 150000) return "50k-150k";
            if (sal < 200000) return "150k-200k";
            return ">200k";
        }

        const expMap = {
            SE: "Senior Executive",
            MI: "Mid-Level",
            EN: "Entry Level",
            EX: "Executive",
        };

        function workLoc(ratio) {
            const val = +ratio;
            if (val === 0) return "On-site";
            if (val === 50) return "Hybrid";
            if (val === 100) return "Remote";
            return "Other";
        }

        // Define data containers for Sankey building
        const sankeyData = { nodes: [], links: [] };
        const nodeMap = new Map();
        let idx = 0;

        function getNodeId(name) {
            if (!nodeMap.has(name)) {
                nodeMap.set(name, idx++);
                sankeyData.nodes.push({ name });
            }
            return nodeMap.get(name);
        }

        const linkMap = new Map();

        data.forEach((d) => {
            const salaryCat = salaryBucket(d.salary_in_usd);
            // Map shouldn't fail, but in case it does we mark unknown as toss entry.
            const expCat = expMap[d.experience_level.trim()] || "Unknown";
            const locCat = workLoc(d.remote_ratio);

            // key for linkMap: source | destination... pretty trivial setup
            let key1 = `${salaryCat}|${expCat}`;
            if (!linkMap.has(key1))
                linkMap.set(key1, {
                    // object with source and destination for easy extraction later.
                    source: getNodeId(salaryCat),
                    target: getNodeId(expCat),
                    value: 0, // frequency counter
                });
            linkMap.get(key1).value++;

            // samething but for stage 2 to 3
            let key2 = `${expCat}|${locCat}`;
            if (!linkMap.has(key2))
                linkMap.set(key2, {
                    source: getNodeId(expCat),
                    target: getNodeId(locCat),
                    value: 0,
                });
            linkMap.get(key2).value++;
        });

        sankeyData.links = Array.from(linkMap.values());

        // Reference our prebuilt svg space.
        const svg = d3.select("#sankey-svg");
        const { width, height } = svg.node().getBoundingClientRect();

        // Reserve space at top for title otherwise push out of bounds...
        const titleHeight = 40;

        // use built in d3 sankey.
        const sankey = d3
            .sankey()
            .nodeWidth(20)
            .nodePadding(15)
            .extent([[1, titleHeight + 1], [width - 1, height - 6]]);

        const graph = sankey(sankeyData);

        // Need more control with the colors so we make custom map
        const color = 
                    {
        "<50k": "#deebf7",       // lightest = smallest
        "50k-150k": "#9ecae1",
        "150k-200k": "#3182bd",
        ">200k": "#08519c",       // darkest = largest
        "Entry Level": "#fee0d2",      
        "Mid-Level": "#fc9272",
        "Executive": "#de2d26",
        "Senior Executive": "#a50f15",
        "Remote": "#e5f5e0", 
        "Hybrid": "#a1d99b",
        "On-site": "#31a354"
        };

        // Add title inside SVG
        svg
            .append("text")
            .attr("x", width / 2)
            .attr("y", titleHeight / 2)
            .attr("text-anchor", "middle")
            .attr("font-family", "sans-serif")
            .attr("font-size", "20px")
            .attr("font-weight", "bold")
            .text("Sankey Diagram: Salary → Work Experience → Work Situation");

        //Draw links ahead of time.
        svg
            .append("g")
            .attr("fill", "none")
            .attr("stroke-opacity", 0.3)
            .selectAll("path")
            .data(graph.links)
            .join("path")
            .attr("class", "link")
            .attr("d", d3.sankeyLinkHorizontal())
            .attr("stroke", (d) => color[d.source.name])
            .attr("stroke-width", (d) => Math.max(1, d.width));

        // Create nodes
        const node = svg
            .append("g")
            .selectAll("g")
            .data(graph.nodes)
            .join("g")
            .attr("class", "node");

        // Scale nodes to be more apparent
        node
            .append("rect")
            .attr("x", (d) => d.x0)
            .attr("y", (d) => d.y0)
            .attr("height", (d) => d.y1 - d.y0)
            .attr("width", (d) => d.x1 - d.x0)
            .attr("fill", (d) => color[d.name])
            .attr("stroke", "#000");

        // Label the nodes
        node
            .append("text")
            .attr("x", (d) => d.x0 - 6)
            .attr("y", (d) => (d.y1 + d.y0) / 2)
            .attr("dy", "0.35em")
            .attr("text-anchor", "end")
            .text((d) => d.name)
            .filter((d) => d.x0 < width / 2)
            .attr("x", (d) => d.x1 + 6)
            .attr("text-anchor", "start");

        // Add animation
        function showPopup(mouseCoords, location, data) {
            if (data.targetLinks.length === 0) {
                console.log("Cannot generate popup for left-most nodes.");
                return;
            }

            d3.selectAll(".popup").remove();  // Remove any existing popups

            // Get mouse position and screen size
            let mouseX = mouseCoords[0];
            let mouseY = mouseCoords[1];
            let screenWidth = window.innerWidth;
            let screenHeight = window.innerHeight;

            // Determine where to place the popup: left or right side
            let placeOnRight = mouseX < screenWidth / 2;

            // Calculate minimum size based on the content
            let popupContent = data.targetLinks.map(d => ({ "label": d.source.name, "value": d.value }));
            let popupWidth = 200;  // Set fixed minimum width
            let popupHeight = Math.max(150, popupContent.length * 30); // Dynamic height based on content

            // Set initial position
            let popupX = placeOnRight ? (data.x1 + 20) : (screenWidth - data.x0 + 20);
            let popupY = location.top + location.height / 2 - popupHeight / 2;

            // Ensure the popup doesn't overflow the viewport vertically (check top and bottom boundaries)
            if (popupY + popupHeight + (popupHeight / 2) > screenHeight) {
                popupY = screenHeight - popupHeight - 80; // Shift up
            } else if (popupY < 0) {
                popupY = 80;  // Shift down
            }

            // Create the popup with a dynamic size and position
            let popup = d3.select("body").append("div")
                .attr("class", "popup " + (placeOnRight ? "right" : "left"))
                .style("top", `${popupY}px`)
                .style(placeOnRight ? "left" : "right", `${popupX}px`)
                .style("width", `${popupWidth}px`)
                .style("height", `${popupHeight+popupHeight/2}px`);

            // Render the pie chart (or content) inside the popup
            renderPie(popup, popupContent);

            // Remove popup on outside click
            d3.select("body").on("click.popup", function() {
                const target = d3.event.target;
                if (!popup.node().contains(target)) {
                    popup.remove();
                    d3.select("body").on("click.popup", null);
                }
            });
        }


        node
            .on("click",
                function(d) {
                    let target = d3.event.target;

                    // Ignore clicks on text elements
                    if (target.tagName === "text" || target.tagName === "TEXT") {
                        return;
                    }
                    let coords = d3.mouse(document.body); // <- D3 v5 way... should've used v7
                    let loc = d3.select(this);
                    showPopup(coords, loc.node().getBoundingClientRect(), d);
                    d3.event.stopPropagation(); // prevent body click from immediately removing it
                });
    }


    // Render graphs
     processData(rawData);
    d3.select("#line-svg").attr("data-year-range", "2020-2023");
    renderBox();
    renderLine();
    renderSankey();

    // Gotta do resize else lose points :((
    window.addEventListener('resize', function() {
        // Do something when the window resizes
        console.log('Window resized to:', window.innerWidth, window.innerHeight);

        d3.select("#sankey-svg").selectAll("*").remove();
        d3.select("#line-svg").selectAll("*").remove();
        d3.select("#box-svg").selectAll("*").remove();
        d3.selectAll(".popup").remove();


        renderBox();
        renderLine();
        renderSankey();
    });


}).catch(function (error) {
    console.log(error);
});