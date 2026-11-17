import { UnauthorizedException } from "@nestjs/common";
import { OneIdSimulatorService } from "./oneid.service";

describe("OneIdSimulatorService (SIMULATOR)", () => {
  const oneId = new OneIdSimulatorService();

  it("lists exactly the 3 fictional test citizens with fake PINFLs", () => {
    const list = oneId.listCitizens();
    expect(list).toHaveLength(3);
    for (const c of list) {
      expect(c.simulated).toBe(true);
      expect(c.pinfl).toMatch(/^0{13}\d$/);
    }
  });

  it("logs in and resolves the session by token", () => {
    const s = oneId.login("test_fuqaro_1");
    expect(oneId.session(s.token).citizen.fio).toBe(s.citizen.fio);
  });

  it("rejects missing or unknown tokens", () => {
    expect(() => oneId.session(undefined)).toThrow(UnauthorizedException);
    expect(() => oneId.session("00000000-0000-4000-8000-000000000000")).toThrow(UnauthorizedException);
  });
});
