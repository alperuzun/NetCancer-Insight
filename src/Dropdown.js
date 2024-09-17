import React, {useState} from "react";
import {render} from "@testing-library/react";
// eslint-disable-next-line react-hooks/rules-of-hooks
// const [selectedDropdownValue, setSelectedDropdownValue] = useState("");

const Dropdown = ({onChange}) => {
    const [selectedDropdownValue, setSelectedDropdownValue] = useState("");
    const handleDropdownChange = (event, d) => {
        const selectedOption = event.target.value;
        setSelectedDropdownValue(selectedOption)
        onChange(selectedOption);
    };

    return (
        <select
            id="nodeDropdown"
            onChange={handleDropdownChange}
            value={selectedDropdownValue || ''}
        >
            <option value="" disabled>Select a Node</option>
            <option key="None" value="">
                No Selection
            </option>
            <option key="Bladder Urothelial Carcinoma" value="Bladder Urothelial Carcinoma">
                Bladder Urothelial Carcinoma
            </option>
            <option key="Breast Cancer" value="Breast Cancer">
                Breast Cancer
            </option>
            <option key="Colorectal Adenocarcinoma" value="Colorectal Adenocarcinoma">
                Colorectal Adenocarcinoma
            </option>
            <option key="Lung Adenocarcinoma" value="Lung Adenocarcinoma">
                Lung Adenocarcinoma
            </option>
            <option key="Pancreatic Adenocarcinoma" value="Pancreatic Adenocarcinoma">
                Pancreatic Adenocarcinoma
            </option>
            <option key="Prostate Adenocarcinoma" value="Prostate Adenocarcinoma">
                Prostate Adenocarcinoma
            </option>
            <option key="Thyroid Carcinoma" value="Thyroid Carcinoma">
                Thyroid Carcinoma
            </option>
        </select>);
};


export default Dropdown;