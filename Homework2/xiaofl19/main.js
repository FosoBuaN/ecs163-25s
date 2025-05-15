/* Follow template convention and update entries value to corresponding types.
    There is a good chunk of data that won't be processed and therefore left unconverted.
     */
d3.csv("data/ds_salaries.csv").then(rawData => {
    console.log("rawData", rawData);

    rawData.forEach(function (d) {
        d.salary_in_usd = Number(d.salary_in_usd);
        d.remote_ratio = Number(d.remote_ratio);
    });

    // Processing data for box and whisker plot. Map{position, {low:0,avg:0,high:0}}
    const positionSalary = new Map();
    rawData.forEach((d) => {
        let pos = d.job_title;
        let salary = d.salary_in_usd;
        // Check if Map key value pair exists. Create if not
        if (!positionSalary.get(pos)) {
            positionSalary.set(pos, {
                low: salary,
                avg: salary,
                high: salary,
                tmp: [salary] // tmp array used to compute average
            });
        } else {
            let oldValue = positionSalary.get(pos);
            oldValue.tmp.push(salary); // insert latest salary
            oldValue.low = salary < oldValue.low ? salary : oldValue.low; // update low
            let new_tmp = 0;
            // compute new average
            oldValue.tmp.forEach(s => {
                new_tmp += s;
            });
            oldValue.avg = new_tmp / oldValue.tmp.length; // update avg
            oldValue.high = salary > oldValue.high ? salary : oldValue.high; // update high
            positionSalary.set(pos, oldValue); // update map value
        }
    });
    // Remove insufficient entries. Those with less than 15 entries with that particular position
    for (const [pos, d] of positionSalary) {
        if (d.tmp.length < 15) {
            positionSalary.delete(pos);
        } else {
            delete d.tmp;
            d.avg = Math.round(d.avg);
        }
    }
    console.log("boxPlotData", positionSalary);

    // Lot of useless stuff but it ok... Box plot begin below.
    // plot 1: box and whisker bar chart sorta plot

    function renderBox() {
        const svg = d3.select("#box-svg");

        const width = 600;
        const height = 300;
        const margin = { top: 30, right: 20, bottom: 50, left: 100 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        svg.attr("width", width).attr("height", height);

        const dataMap = positionSalary;

        const data = Array.from(dataMap.entries()).map(([role, vals]) => ({
            role,
            ...vals
        }));

        const x = d3.scaleLinear()
            .domain([
                d3.min(data, d => d.low),
                d3.max(data, d => d.high)
            ])
            .range([0, innerWidth]);

        const y = d3.scaleBand()
            .domain(data.map(d => d.role))
            .range([0, innerHeight])
            .padding(0.3);

        svg.selectAll("*").remove(); // Clear previous render
        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Axes
        g.append("g")
            .attr("transform", `translate(0,${innerHeight})`)
            .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("$.2s")));

        g.append("g")
            .call(d3.axisLeft(y))
            .selectAll("text")
            .style("font-size", "6px"); // gotta scale down the role labels cause overflow my container.

        // Axis label
        svg.append("text")
            .attr("x", margin.left + innerWidth / 2)
            .attr("y", height - 10)
            .attr("text-anchor", "middle")
            .text("Salary ($)")
            .attr("font-size", "12px");

        // Title
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", 20)
            .attr("text-anchor", "middle")
            .text("Salary Ranges by Position")
            .attr("font-size", "14px")
            .attr("font-weight", "bold");

        // Whiskers
        g.selectAll(".whisker")
            .data(data)
            .enter()
            .append("line")
            .attr("x1", d => x(d.low))
            .attr("x2", d => x(d.high))
            .attr("y1", d => y(d.role) + y.bandwidth() / 2)
            .attr("y2", d => y(d.role) + y.bandwidth() / 2)
            .attr("stroke", "#666")
            .attr("stroke-width", 2);

        // Average dots
        g.selectAll(".avg-dot")
            .data(data)
            .enter()
            .append("circle")
            .attr("cx", d => x(d.avg))
            .attr("cy", d => y(d.role) + y.bandwidth() / 2)
            .attr("r", 4)
            .attr("fill", "steelblue");
    }

    // process data for line graph Map{role, {year:[],...,year_n:[]}}
    let filteredData = new Map();
    rawData.forEach(d => {
        let role = d.job_title;
        let salary = d.salary_in_usd;
        let year = d.work_year;
        // create entry for role if dne
        if (!filteredData.get(role)) {

            filteredData.set(role, { [year]: [salary] });
        } else {
            let oldValue = filteredData.get(role);
            if (!oldValue[year]) {
                oldValue[year] = [salary];
            } else {
                oldValue[year].push(salary);
            }
            filteredData.set(role, oldValue);
        }
    });
    console.log("Line Graph", filteredData);
    // filter out the dead positions with like no data
    for (const [role, v] of filteredData) {
        let l = 0;
        for (let yr of Object.values(v)) {
            l += yr.length;
        }
        if (l < 15) {
            filteredData.delete(role);
        } else {
            for (let [year, arr] of Object.entries(v)) {
                v[year] = Math.round(arr.reduce((acc, val) => acc + val, 0) / arr.length);
            }
        }
    }
    console.log("Line Graph", filteredData);
    // plot 2: line graph for salary vs time
    function renderLine() {
        const svg = d3.select("#line-svg");

        const width = 600;
        const height = 300;
        const margin = { top: 30, right: 20, bottom: 50, left: 60 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        svg.attr("width", width).attr("height", height + 50);
        svg.selectAll("*").remove(); // Clear previous render

        // Sample data
        const rawData = filteredData;

        // Format data into array of series
        const years = [2020, 2021, 2022, 2023];
        const data = Array.from(rawData.entries()).map(([role, yearMap]) => ({
            role,
            values: years.map(year => ({ year, salary: yearMap[year] }))
        }));

        const x = d3.scaleLinear()
            .domain(d3.extent(years))
            .range([0, innerWidth]);

        const y = d3.scaleLinear()
            .domain([
                d3.min(data, d => d3.min(d.values, v => v.salary)),
                d3.max(data, d => d3.max(d.values, v => v.salary))
            ])
            .range([innerHeight, 0]);

        const colors = d3.schemeTableau10.concat(d3.schemeSet3); // need to support 19 datasets
        const color = d3.scaleOrdinal(colors)
            .domain(data.map(d => d.role));

        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Axes
        g.append("g")
            .attr("transform", `translate(0,${innerHeight})`)
            .call(d3.axisBottom(x).ticks(4).tickFormat(d3.format("d")));

        g.append("g")
            .call(d3.axisLeft(y).tickFormat(d3.format("$.2s")));

        // Axis labels
        svg.append("text")
            .attr("x", margin.left + innerWidth / 2)
            .attr("y", height - 20)
            .attr("text-anchor", "middle")
            .text("Year");

        svg.append("text")
            .attr("transform", `translate(15, ${margin.top + innerHeight / 2}) rotate(-90)`)
            .attr("text-anchor", "middle")
            .text("Salary");

        // Title
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", 20)
            .attr("text-anchor", "middle")
            .attr("font-size", "14px")
            .attr("font-weight", "bold")
            .text("Average Salary Trends by Role From 2020 to 2023");

        const line = d3.line()
            .x(d => x(d.year))
            .y(d => y(d.salary));

        g.selectAll(".line")
            .data(data)
            .enter()
            .append("path")
            .attr("fill", "none")
            .attr("stroke", d => color(d.role))
            .attr("stroke-width", 2)
            .attr("d", d => line(d.values));

        // Add legend
        const legend = svg.append("g")
            .attr("transform", `translate(${margin.left}, ${margin.bottom + 235})`);

        const roles = data.map(d => d.role);
        const legendCols = 4;
        const itemsPerCol = Math.ceil(roles.length / legendCols);
        const legendSpacingX = 125;
        const legendSpacingY = 12;

        roles.forEach((role, i) => {
            const col = Math.floor(i / itemsPerCol);
            const row = i % itemsPerCol;

            const gLegend = legend.append("g")
                .attr("transform", `translate(${col * legendSpacingX}, ${row * legendSpacingY})`);

            gLegend.append("rect")
                .attr("width", 10)
                .attr("height", 10)
                .attr("fill", color(role));

            gLegend.append("text")
                .attr("x", 15)
                .attr("y", 8)
                .attr("font-size", "8px")
                .text(role);
        });

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

        const color = d3.scaleOrdinal(d3.schemeCategory10);

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
            .attr("stroke", (d) => color(d.source.name))
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
            .attr("fill", (d) => color(d.name))
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
    }


    // Render graphs
    renderBox();
    renderLine();
    renderSankey();


}).catch(function (error) {
    console.log(error);
});