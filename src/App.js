/*
Into both force graphs pass in a state setter for the panel that provides node info and make both force graphs
use that so that when you render the info panel there is no duplicates
*/



import React, { useState } from 'react';
import {PanelGroup, Panel, PanelResizeHandle} from "react-resizable-panels";
// import {
//     BrowserRouter as Router,
//     Routes,
//     Route,
// } from "react-router-dom";
import DataPreprocessing from "./DataPreprocessing";
import ForceGraph from "./ForceGraph";
import SpiderGraph from "./SpiderGraph";
import ComparativeAnalysis from "./ComparativeAnalysis";
import Navbar from "./NavBar";



const App = () => {
    const [visibilityMap, setVisibilityMap] = useState({"P0": true, "P1": true})
    const [visible, setVisible] = useState(false)
    const [nodes, setNodes] = useState([]);
    const [links, setLinks] = useState([]);
    const [nodes2, setNodes2] = useState([]);
    const [links2, setLinks2] = useState([]);
    const [nodeEdges, setNodeEdges] = useState([])
    const [nodeEdges2, setNodeEdges2] = useState([])
    const [graphMetrics, setGraphMetrics] = useState([]);
    const [graphMetrics2, setGraphMetrics2] = useState([]);

    const handleButtonClick = () => {
        setVisible(!visible)
        if (nodes2 !== [] || links2 !== []) {
            setNodes2([])
            setLinks2([])
            setGraphMetrics2([])
        }
    }


        return (
            <>
            <Navbar/>
            <PanelGroup direction="horizontal">
                <Panel defaultSize={50} minSize={20} order={1}>
                    <button onClick={handleButtonClick}>New Panel</button>
                    <ComparativeAnalysis nodes1={nodes} nodes2={nodes2} graphMetrics1={graphMetrics} graphMetrics2={graphMetrics2} nodeEdges1={nodeEdges} nodeEdges2={nodeEdges2}/>
                    <DataPreprocessing onNodes={setNodes} onLinks = {setLinks} onGraphMetrics={setGraphMetrics} onNodeEdges={setNodeEdges}/>
                    <ForceGraph nodes={nodes} links={links} graphMetrics={graphMetrics} />
                                        {/*<ForceGraph nodes={nodes} links={links} />*/}
                    {/*<SpiderGraph/>*/}
                </Panel>
                { visible && (
                        <>
                            <PanelResizeHandle style={{backgroundColor: "black", fill: "black"}}/>
                            <Panel order={2}>
                                <DataPreprocessing onNodes={setNodes2} onLinks = {setLinks2} onGraphMetrics={setGraphMetrics2} onNodeEdges={setNodeEdges2}/>
                                                    {/*<SpiderGraph/>*/}
                                <ForceGraph nodes={nodes2} links={links2} graphMetrics={graphMetrics2} />
                                                     {/*<ForceGraph nodes={nodes} links={links} />*/}
                            </Panel>
                        </>
                     )
                }
            </PanelGroup>
                </>



    );
};

export default App;

